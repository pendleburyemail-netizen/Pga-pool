// pages/api/picks.js — stores picks in a private GitHub Gist
// Env vars needed: GIST_ID, GITHUB_TOKEN, POOL_PIN

const GIST_FILE = 'picks.json';

async function loadPicks() {
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
  return Array.isArray(parsed) && parsed.length > 0 ? parsed : null;
}

async function savePicks(participants) {
  const res = await fetch(`https://api.github.com/gists/${process.env.GIST_ID}`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${process.env.GITHUB_TOKEN}`,
      'Accept': 'application/vnd.github+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      files: { [GIST_FILE]: { content: JSON.stringify(participants) } },
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
      has: { gistId: !!process.env.GIST_ID, token: !!process.env.GITHUB_TOKEN },
    });
  }

  if (req.method === 'GET') {
    try {
      const participants = await loadPicks();
      return res.status(200).json({ participants, isDefault: !participants });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  if (req.method === 'POST') {
    const { participants, pin } = req.body || {};
    if (String(pin) !== String(process.env.POOL_PIN || '1234')) {
      return res.status(403).json({ error: 'Incorrect PIN' });
    }
    if (!Array.isArray(participants) || participants.length === 0) {
      return res.status(400).json({ error: 'Invalid data' });
    }
    try {
      await savePicks(participants);
      return res.status(200).json({ ok: true });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
