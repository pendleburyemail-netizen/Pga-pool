// pages/api/debug.js — temporary diagnostic endpoint

export default async function handler(req, res) {
  try {
    const response = await fetch(
      'https://site.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard',
      { headers: { 'User-Agent': 'Mozilla/5.0' } }
    );
    const raw = await response.json();
    const events = raw.events || [];
    const ev = events[0] || {};
    const comp = (ev.competitions || [])[0] || {};
    const competitors = comp.competitors || [];

    const maxLinescores = competitors.length > 0
      ? Math.max(...competitors.map(c => (c.linescores || []).length))
      : 0;

    const sample = [...competitors.slice(0, 5), ...competitors.slice(-5)];

    const out = {
      eventName: ev.name,
      eventStatus: ev.status?.type?.name,
      eventStatusDesc: ev.status?.type?.description,
      totalCompetitors: competitors.length,
      currentRoundDetected: maxLinescores,
      cutLine: comp.situation?.cutLine
        || comp.cutLine
        || ev.competitions?.[0]?.situation?.cutLine
        || ev.situation?.cutLine
        || null,
      compKeys: Object.keys(comp).join(', '),
      situationKeys: comp.situation ? Object.keys(comp.situation).join(', ') : 'none',
      sampleCompetitors: sample.map(c => {
        const ls = c.linescores || [];
        const r1 = ls[0]?.displayValue ?? null;
        const r2 = ls[1]?.displayValue ?? null;
        const r3 = ls[2]?.displayValue ?? null;
        const patternA = maxLinescores >= 3 && ls.length <= 2 && r1 !== null;
        const patternB = ls.length >= 3 && r1 !== null && r2 !== null && (r3 === '-' || r3 === null);
        return {
          name: c.athlete?.displayName,
          score: c.score,
          linescoreCount: ls.length,
          linescores: ls.map(l => l.displayValue),
          patternA,
          patternB,
          wouldBeMC: patternA || patternB,
          statusTypeName: c.status?.type?.name,
          statusDesc: c.status?.type?.description,
        };
      }),
    };

    res.setHeader('Content-Type', 'application/json');
    return res.status(200).json(out);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
