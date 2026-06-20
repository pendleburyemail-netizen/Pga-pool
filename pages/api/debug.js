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

    const r3HasStarted = competitors.some(c => {
      const ls = c.linescores || [];
      if (ls.length < 3) return false;
      const r3val = ls[2]?.displayValue;
      return r3val !== null && r3val !== undefined && r3val !== '-' && r3val !== '--' && r3val !== '';
    });

    // Sample: first 3 (leaders), middle 3 (around cut line), last 3 (missed cut)
    const mid = Math.floor(competitors.length / 2);
    const sample = [
      ...competitors.slice(0, 3),
      ...competitors.slice(mid - 1, mid + 2),
      ...competitors.slice(-3),
    ];

    const out = {
      eventName: ev.name,
      eventStatus: ev.status?.type?.name,
      totalCompetitors: competitors.length,
      maxLinescores,
      r3HasStarted,
      cutLine: comp.situation?.cutLine || null,
      sampleCompetitors: sample.map(c => {
        const ls = c.linescores || [];
        return {
          name: c.athlete?.displayName,
          score: c.score,
          linescoreCount: ls.length,
          linescores: ls.map(l => l.displayValue),
          // Full status object to see what ESPN provides
          statusType: c.status?.type,
          statusPeriod: c.status?.period,
          statusDisplayClock: c.status?.displayClock,
          statusShortDetail: c.status?.shortDetail,
          statusDetail: c.status?.detail,
          // Any other top-level fields on competitor
          competitorKeys: Object.keys(c).join(', '),
        };
      }),
    };

    res.setHeader('Content-Type', 'application/json');
    return res.status(200).json(out);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
