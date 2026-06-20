// pages/api/debug.js

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
      ? Math.max(...competitors.map(c => (c.linescores || []).length)) : 0;

    // Show order values and scores around the cut bubble
    // to see if order resets or jumps for cut players
    const withOrder = competitors.map(c => ({
      name: c.athlete?.displayName,
      order: c.order,
      score: c.score,
      linescoreCount: (c.linescores || []).length,
      r3: (c.linescores || [])[2]?.displayValue ?? null,
      // Check linescores for any extra fields beyond displayValue
      linescore0keys: c.linescores?.[0] ? Object.keys(c.linescores[0]).join(', ') : 'none',
      linescore2keys: c.linescores?.[2] ? Object.keys(c.linescores[2]).join(', ') : 'none',
      // Full linescore[2] object for cut players
      linescore2full: c.linescores?.[2] || null,
    }));

    // Show first 5, players 50-55 (around cut), last 10
    const out = {
      eventName: ev.name,
      totalCompetitors: competitors.length,
      maxLinescores,
      orderFirst5: withOrder.slice(0, 5),
      orderAround50: withOrder.slice(48, 56),
      orderLast10: withOrder.slice(-10),
    };

    res.setHeader('Content-Type', 'application/json');
    return res.status(200).json(out);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
