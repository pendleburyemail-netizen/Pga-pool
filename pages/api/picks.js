// pages/api/picks.js — stores picks + tournament name in a private GitHub Gist
// When tournament name changes, the app clears picks automatically.

const GIST_FILE = 'picks.json';

async function loadData() {
  const res = await fetch(`https://api.github.com/gists/${process.env.GIST_ID}`, {
    headers: {
      'Authorization': `Bearer ${process.env.GITHUB_TOKEN}`,
      'Accept': 'application/vnd.github+json',
    },
  });
  if (!res.ok) throw new Error(`GitHub GET failed: ${res.status}`);
  const gist = await res.json();
  const content = gist.files?.[GIST_FILE]?.content;
  if (!content) return null;
  const parsed = JSON.parse(content);
  // Support both old format (plain array) and new format ({ tournament, participants })
  if (Array.isArray(parsed)) return { tournament: null, participants: parsed };
  return parsed;
}

async function saveData(data) {
  const res = await fetch(`https://api.github.com/gists/${process.env.GIST_ID}`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${process.env.GITHUB_TOKEN}`,
      'Accept': 'application/vnd.github+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      files: { [GIST_FILE]: { content: JSON.stringify(data) } },
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub PATCH failed: ${res.status} — ${text}`);
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (!process.env.GIST_ID || !process.env.GITHUB_TOKEN) {
    return res.status(503).json({
      error: 'Not configured. Add GIST_ID and GITHUB_TOKEN to Vercel environment variables.',
    });
  }

  if (req.method === 'GET') {
    try {
      const data = await loadData();
      return res.status(200).json({
        participants: data?.participants || null,
        savedTournament: data?.tournament || null,
        isDefault: !data?.participants,
      });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  if (req.method === 'POST') {
    const { participants, pin, tournament } = req.body || {};
    if (String(pin) !== String(process.env.POOL_PIN || '1234')) {
      return res.status(403).json({ error: 'Incorrect PIN' });
    }
    if (!Array.isArray(participants) || participants.length === 0) {
      return res.status(400).json({ error: 'Invalid data' });
    }
    try {
      await saveData({ tournament: tournament || null, participants });
      return res.status(200).json({ ok: true });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
