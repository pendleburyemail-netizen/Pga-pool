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
      sampleCompetitors: sample.map(c => ({
        name: c.athlete?.displayName,
        score: c.score,
        linescoreCount: (c.linescores || []).length,
        linescores: (c.linescores || []).map(ls => ls.displayValue),
        statusTypeName: c.status?.type?.name,
        statusDesc: c.status?.type?.description,
        statusShortDetail: c.status?.shortDetail,
      })),
    };

    res.setHeader('Content-Type', 'application/json');
    return res.status(200).json(out);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
