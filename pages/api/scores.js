// pages/api/scores.js
// Proxies ESPN PGA scoreboard. Cut detection uses top-60-plus-ties rule.

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
  if (s === '--' || s === '' || s === '-') return null;
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
  // Priority: 1) Majors in progress, 2) Any event in progress with most competitors,
  // 3) Most recent completed, 4) First event
  const MAJORS = ['masters', 'u.s. open', 'us open', 'open championship', 'pga championship'];
  const isMajor = e => MAJORS.some(m => (e.name || '').toLowerCase().includes(m));
  const inProgress = events.filter(e => (e.status?.type?.name || '').includes('IN_PROGRESS'));

  let chosenEvent = null;
  if (inProgress.length > 0) {
    // Among in-progress events, prefer majors, then largest field
    const majorInProgress = inProgress.find(isMajor);
    if (majorInProgress) {
      chosenEvent = majorInProgress;
    } else {
      // Pick the one with most competitors (biggest/most important event)
      chosenEvent = inProgress.reduce((best, e) => {
        const count = (e.competitions?.[0]?.competitors || []).length;
        const bestCount = (best.competitions?.[0]?.competitors || []).length;
        return count > bestCount ? e : best;
      }, inProgress[0]);
    }
  } else {
    // No event in progress — prefer majors, then largest field
    const majorScheduled = events.find(isMajor);
    if (majorScheduled) {
      chosenEvent = majorScheduled;
    } else {
      chosenEvent = events.reduce((best, e) => {
        const count = (e.competitions?.[0]?.competitors || []).length;
        const bestCount = (best.competitions?.[0]?.competitors || []).length;
        return count > bestCount ? e : best;
      }, events[0]);
    }
  }

  if (!chosenEvent) {
    return { tournament: null, golfers: [], currentRound: 0, cutHasHappened: false, cutLine: null, lastUpdated: new Date().toISOString() };
  }

  const competition = (chosenEvent.competitions || [])[0] || {};
  const competitors = competition.competitors || [];
  const par = competition.situation?.parTotal || 72;
  const tStatus = (chosenEvent.status || {}).type || {};
  const isFinal = tStatus.name === 'STATUS_FINAL' || !!tStatus.completed;
  const isInProgress = (tStatus.name || '').includes('IN_PROGRESS');

  const maxLinescores = competitors.reduce((m, c) => Math.max(m, (c.linescores || []).length), 0);
  const currentRound = competition.period || maxLinescores || 0;
  const cutHasHappened = isFinal || currentRound >= 3;

  // ── Parse all raw scores first ──────────────────────────────────────────────
  const rawGolfers = competitors.map(comp => {
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
    const realRounds = rounds.filter(r => r !== null).length;

    return { name, nameKey: normalizeName(name), rounds, totalRaw, realRounds, linescoreCount: linescores.length };
  });

  // ── Calculate cut line using tournament-specific rule ─────────────────────
  // Masters: top 50 + ties
  // US Open, Open Championship, PGA Championship: top 60 + ties (low 60)
  // All other PGA Tour events: top 65 + ties
  const eventNameLower = (chosenEvent.name || '').toLowerCase();
  const cutPosition =
    eventNameLower.includes('masters') ? 50 :
    eventNameLower.includes('u.s. open') || eventNameLower.includes('us open') ||
    eventNameLower.includes('open championship') || eventNameLower.includes('pga championship') ? 60 :
    65; // standard PGA Tour

  let cutLine = null;
  if (cutHasHappened) {
    const twoRoundScores = rawGolfers
      .filter(g => g.realRounds >= 2 && g.totalRaw !== null)
      .map(g => g.totalRaw)
      .sort((a, b) => a - b);

    if (twoRoundScores.length >= cutPosition) {
      cutLine = twoRoundScores[cutPosition - 1]; // 0-indexed
    } else if (twoRoundScores.length > 0) {
      cutLine = twoRoundScores[twoRoundScores.length - 1];
    }
  }

  // ── Assign cut status ───────────────────────────────────────────────────────
  const golfers = rawGolfers.map(g => {
    const { name, nameKey, rounds, totalRaw, realRounds, linescoreCount } = g;

    let missedCut = false;
    let status = 'Active';

    if (cutHasHappened) {
      if (realRounds <= 1) {
        // Withdrew before or during R1
        missedCut = true;
        status = 'WD';
      } else if (realRounds === 2 && cutLine !== null && totalRaw !== null && totalRaw > cutLine) {
        // Completed 2 rounds but scored above cut line
        missedCut = true;
        status = 'MC';
      }
      // realRounds >= 3 = made the cut and is playing R3/R4
    }

    return {
      name,
      nameKey,
      r1: rounds[0], r2: rounds[1], r3: rounds[2], r4: rounds[3],
      total: missedCut ? null : totalRaw,
      displayTotal: missedCut ? status : formatScore(totalRaw),
      status,
      position: null,
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
    cutHasHappened,
    cutLine,
    golfers,
    lastUpdated: new Date().toISOString(),
  };
}
