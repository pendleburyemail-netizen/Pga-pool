// pages/api/debug.js
// Visit /api/debug to see raw ESPN data structure
// DELETE THIS FILE after debugging is done

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

    // Sample first 5 and last 5 competitors
    const sample = [
      ...competitors.slice(0, 5),
      ...competitors.slice(-5),
    ];

    const out = {
      eventName: ev.name,
      eventStatus: ev.status?.type?.name,
      eventStatusDesc: ev.status?.type?.description,
      totalCompetitors: competitors.length,
      currentRoundDetected: Math.max(...competitors.map(c => (c.linescores || []).length), 0),
      // Look for cut line in various places ESPN might put it
      cutLine: comp.situation?.cutLine
        || comp.cutLine
        || ev.competitions?.[0]?.situation?.cutLine
        || ev.situation?.cutLine
        || null,
      compKeys: Object.keys(comp).join(', '),
      situationKeys: comp.situation ? Object.keys(comp.situation).join(', ') : 'none',
      sampleCompetitors: sample.map(c => ({
        name: c.athlete?.displayName,
        score: c.score,
        linescoreCount: (c.linescores || []).length,
        linescores: (c.linescores || []).map(ls => ls.displayValue),
        r1: (c.linescores || [])[0]?.displayValue,
        r2: (c.linescores || [])[1]?.displayValue,
        r3: (c.linescores || [])[2]?.displayValue,
        patternA: maxLS >= 3 && (c.linescores || []).length <= 2,
        patternB: (c.linescores || []).length >= 3 && (c.linescores || [])[0]?.displayValue !== undefined && (c.linescores || [])[1]?.displayValue !== undefined && ((c.linescores || [])[2]?.displayValue === '-' || (c.linescores || [])[2]?.displayValue === undefined || (c.linescores || [])[2]?.displayValue === null),
        statusTypeName: c.status?.type?.name,
      })),
    };

    res.setHeader('Content-Type', 'application/json');
    return res.status(200).json(out);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
