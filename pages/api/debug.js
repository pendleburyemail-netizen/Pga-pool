// pages/api/debug.js

export default async function handler(req, res) {
  try {
    const response = await fetch(
      'https://site.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard',
      { headers: { 'User-Agent': 'Mozilla/5.0' } }
    );
    const raw = await response.json();
    const events = raw.events || [];

    const out = {
      totalEvents: events.length,
      events: events.map(ev => ({
        id: ev.id,
        name: ev.name,
        shortName: ev.shortName,
        status: ev.status?.type?.name,
        statusDesc: ev.status?.type?.description,
        competitors: (ev.competitions?.[0]?.competitors || []).length,
      })),
    };

    res.setHeader('Content-Type', 'application/json');
    return res.status(200).json(out);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
