// pages/api/scores.js
// Proxies ESPN's PGA Tour scoreboard.
//
// CUT DETECTION: ESPN removes cut players from the competitor list after R2.
// We detect this by:
//   1. Counting max linescores across all competitors (= current round)
//   2. Any picked player absent from the list when currentRound >= 3 = CUT
//   3. Also triggers when the event status is FINAL (tournament over)

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  try {
    const response = await fetch(
      'https://site.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard',
      { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; GolfPool/1.0)' } }
    );
    if (!response.ok) return res.status(502).json({ error: `ESPN returned ${response.status}` });
    const raw = await response.json();
    const parsed = parseESPN(raw);
    res.setHeader('Cache-Control', 's-maxage=45, stale-while-revalidate=60');
    return res.status(200).json(parsed);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

function normalizeName(name) {
  return name
    .toLowerCase()
    .replace(/[áàâä]/g, 'a').replace(/[éèêë]/g, 'e')
    .replace(/[íìîï]/g, 'i').replace(/[óòôö]/g, 'o')
    .replace(/[úùûü]/g, 'u').replace(/[ñ]/g, 'n')
    .replace(/[ç]/g, 'c').replace(/[ý]/g, 'y')
    .replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
}

function parseScore(str) {
  if (str === null || str === undefined) return null;
  const s = String(str).trim();
  if (s === 'E' || s === 'EVEN') return 0;
  if (s === '--' || s === '') return null;
  const n = parseInt(s, 10);
  return isNaN(n) ? null : n;
}

function formatScore(score) {
  if (score === null || score === undefined) return '--';
  if (score === 0) return 'E';
  return score > 0 ? `+${score}` : `${score}`;
}

function parseESPN(json) {
  const events = json.events || [];

  // Prefer in-progress, then most recent
  let chosenEvent = events.find(e =>
    (e.status?.type?.name || '').includes('IN_PROGRESS')
  ) || events[events.length - 1] || events[0] || null;

  if (!chosenEvent) {
    return { tournament: null, golfers: [], currentRound: 0, cutHasHappened: false, lastUpdated: new Date().toISOString() };
  }

  const competition = (chosenEvent.competitions || [])[0] || {};
  const competitors = competition.competitors || [];
  const par = competition.situation?.parTotal || 72;

  const tStatus = (chosenEvent.status || {}).type || {};
  const isFinal = tStatus.name === 'STATUS_FINAL' || !!tStatus.completed;
  const isInProgress = (tStatus.name || '').includes('IN_PROGRESS');

  // Count max rounds played by any competitor in the field
  const maxLinescores = competitors.reduce((max, c) =>
    Math.max(max, (c.linescores || []).length), 0
  );

  // Current round: use ESPN's period/round if available, else infer from linescores
  const currentRound = competition.period || maxLinescores || 0;

  // Cut has happened once R3 starts, or when the event is final
  const cutHasHappened = isFinal || currentRound >= 3;

  // R3 has started only when at least one competitor has a real (non-null) R3 score
  const r3HasStarted = competitors.some(c => {
    const ls = c.linescores || [];
    if (ls.length < 3) return false;
    const r3val = ls[2]?.displayValue;
    return r3val !== null && r3val !== undefined && r3val !== '-' && r3val !== '--' && r3val !== '';
  });

  const golfers = competitors.map(comp => {
    const athlete = comp.athlete || {};
    const name = (athlete.displayName || athlete.fullName || '').trim();
    const linescores = comp.linescores || [];

    const rounds = [null, null, null, null];
    for (let r = 0; r < Math.min(linescores.length, 4); r++) {
      const ls = linescores[r];
      if (ls.displayValue !== undefined) {
        rounds[r] = parseScore(ls.displayValue);
      } else if (ls.value !== undefined) {
        rounds[r] = Math.round(ls.value - par);
      }
    }

    const totalRaw = parseScore(comp.score);

    // Cut detection:
    // Pattern A: player has <= 2 linescores when field is in R3+ (WD/DNS)
    // Pattern B: player has 3 linescores but R3 is blank "-" AND at least one
    //            other competitor has a real R3 score (confirms R3 is underway,
    //            not just everyone waiting to tee off)
    // Pattern A: <=2 linescores when R3+ is underway = WD/DNS
    // Pattern B: DISABLED until we identify the correct ESPN field to detect MC
    //            (r3HasStarted alone is not enough — pre-R3 players also have blank R3)
    const patternA = cutHasHappened && linescores.length <= 2 && rounds[0] !== null;
    const patternB = false; // TODO: re-enable once cut detection signal is confirmed
    // Determine elimination type
    // WD: only 1 real round (withdrew during or before R1/R2)
    // MC: 2 real rounds completed but didn't advance
    const realRounds = [rounds[0], rounds[1], rounds[2], rounds[3]].filter(r => r !== null).length;
    const eliminationType = (patternA && realRounds <= 1) ? 'WD' : 'MC';
    const missedCut = patternA || patternB;

    return {
      name,
      nameKey: normalizeName(name),
      r1: rounds[0], r2: rounds[1], r3: rounds[2], r4: rounds[3],
      total: missedCut ? null : totalRaw,
      displayTotal: missedCut ? eliminationType : formatScore(totalRaw),
      status: missedCut ? eliminationType : 'Active',
      position: comp.status?.position?.displayText || null,
    };
  });

  golfers.sort((a, b) => {
    if (a.total === null && b.total === null) return 0;
    if (a.total === null) return 1;
    if (b.total === null) return -1;
    return a.total - b.total;
  });

  return {
    tournament: {
      id: chosenEvent.id,
      name: chosenEvent.name || chosenEvent.shortName || 'PGA Tour Event',
      shortName: chosenEvent.shortName || chosenEvent.name || '',
      venue: chosenEvent.competitions?.[0]?.venue?.fullName || '',
      location: (() => {
        const v = chosenEvent.competitions?.[0]?.venue;
        if (!v) return '';
        return [v.city, v.state, v.country].filter(Boolean).join(', ');
      })(),
      status: tStatus.description || 'Scheduled',
      isLive: isInProgress,
      isFinal,
      par,
    },
    currentRound,
    cutHasHappened,  // explicit flag — true when R3+ or event final
    golfers,
    lastUpdated: new Date().toISOString(),
  };
}
