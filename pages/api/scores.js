// pages/api/scores.js
// Proxies ESPN's PGA Tour scoreboard — auto-detects the current tournament.

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  try {
    const espnUrl =
      'https://site.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard';

    const response = await fetch(espnUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; GolfPool/1.0)' },
    });

    if (!response.ok) {
      return res.status(502).json({ error: `ESPN returned ${response.status}` });
    }

    const raw = await response.json();
    const parsed = parseESPN(raw);

    res.setHeader('Cache-Control', 's-maxage=45, stale-while-revalidate=60');
    return res.status(200).json(parsed);
  } catch (err) {
    console.error('ESPN fetch error:', err);
    return res.status(500).json({ error: err.message });
  }
}

// ── Parsing ────────────────────────────────────────────────────────────────────

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
  if (s === '--' || s === '' || s === 'CUT' || s === 'WD') return null;
  const n = parseInt(s, 10);
  return isNaN(n) ? null : n;
}

function formatScore(score) {
  if (score === null || score === undefined) return '--';
  if (score === 0) return 'E';
  return score > 0 ? `+${score}` : `${score}`;
}

function parseStatus(comp) {
  const type = ((comp.status || {}).type || {});
  const name = (type.name || '').toUpperCase();
  const desc = (type.description || '').toUpperCase();
  const shortDetail = (comp.status?.shortDetail || '').toUpperCase();

  if (name.includes('CUT') || desc.includes('CUT') || shortDetail.includes('CUT') ||
      name === 'STATUS_MISSED_CUT') return 'MC';
  if (name.includes('WITHDRAW') || desc.includes('WITHDRAW') || shortDetail.includes('WD') ||
      name === 'STATUS_WITHDRAWN' || name === 'STATUS_DQ') return 'WD';
  return 'Active';
}

function parseESPN(json) {
  const events = json.events || [];

  // Pick the most relevant event:
  // Priority: in-progress > most recent closed > next scheduled
  let chosenEvent = null;

  const inProgress = events.find(e =>
    (e.status?.type?.name || '').includes('IN_PROGRESS')
  );
  if (inProgress) {
    chosenEvent = inProgress;
  } else {
    // Most recently completed or upcoming
    chosenEvent = events[events.length - 1] || events[0] || null;
  }

  if (!chosenEvent) {
    return { tournament: null, golfers: [], lastUpdated: new Date().toISOString() };
  }

  const competition = (chosenEvent.competitions || [])[0] || {};
  const competitors = competition.competitors || [];

  // Detect par from competition details (fallback 72)
  const par = competition.situation?.parTotal
    || chosenEvent.competitions?.[0]?.situation?.parTotal
    || 72;

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
    const status = parseStatus(comp);
    const isCutOrWD = status === 'MC' || status === 'WD';

    return {
      name,
      nameKey: normalizeName(name),
      r1: rounds[0], r2: rounds[1], r3: rounds[2], r4: rounds[3],
      total: isCutOrWD ? null : totalRaw,
      displayTotal: status === 'MC' ? 'CUT' : status === 'WD' ? 'WD' : formatScore(totalRaw),
      status,
      statusRaw: (comp.status?.type?.name || '') + '|' + (comp.status?.type?.description || ''),
      position: comp.status?.position?.displayText || null,
    };
  });

  // Sort by total (ascending, nulls last)
  golfers.sort((a, b) => {
    if (a.total === null && b.total === null) return 0;
    if (a.total === null) return 1;
    if (b.total === null) return -1;
    return a.total - b.total;
  });

  const tStatus = (chosenEvent.status || {}).type || {};

  // Extract dates
  const startDate = chosenEvent.competitions?.[0]?.date
    || chosenEvent.date || null;

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
      isLive: tStatus.name === 'STATUS_IN_PROGRESS',
      isFinal: tStatus.name === 'STATUS_FINAL' || tStatus.completed,
      startDate,
      par,
    },
    golfers,
    lastUpdated: new Date().toISOString(),
  };
}
