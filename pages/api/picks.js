// pages/api/picks.js
// Stores picks using JSONBin.io — a free JSON storage API.
// No complex setup, just needs a JSONBIN_API_KEY and JSONBIN_BIN_ID env var.
//
// SETUP (2 minutes):
//   1. Go to https://jsonbin.io and click "Sign Up Free"
//   2. After signing in, click "Create Bin"
//   3. Paste this as the initial content: []
//   4. Click "Create Bin" — copy the Bin ID from the URL or response
//   5. Click your account icon → API Keys → copy your Master Key
//   6. In Vercel: Settings → Environment Variables, add:
//      JSONBIN_BIN_ID  = the bin ID (looks like 6849a1234abc...)
//      JSONBIN_API_KEY = your master key (looks like $2a$10$...)
//      POOL_PIN        = your chosen PIN

const BASE_URL = 'https://api.jsonbin.io/v3/b';

async function loadPicks() {
  const res = await fetch(`${BASE_URL}/${process.env.JSONBIN_BIN_ID}/latest`, {
    headers: {
      'X-Master-Key': process.env.JSONBIN_API_KEY,
      'X-Bin-Meta': 'false',
    },
  });
  if (!res.ok) throw new Error(`JSONBin GET failed: ${res.status}`);
  const data = await res.json();
  // data is the raw content we stored
  if (Array.isArray(data) && data.length > 0) return data;
  if (Array.isArray(data?.participants)) return data.participants;
  return null;
}

async function savePicks(participants) {
  const res = await fetch(`${BASE_URL}/${process.env.JSONBIN_BIN_ID}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'X-Master-Key': process.env.JSONBIN_API_KEY,
    },
    body: JSON.stringify(participants),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`JSONBin PUT failed: ${res.status} — ${text}`);
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (!process.env.JSONBIN_BIN_ID || !process.env.JSONBIN_API_KEY) {
    return res.status(503).json({
      error: 'JSONBin not configured. Add JSONBIN_BIN_ID and JSONBIN_API_KEY to Vercel environment variables.',
      setup: 'Visit https://jsonbin.io — sign up free, create a bin, copy the ID and your API key.',
    });
  }

  if (req.method === 'GET') {
    try {
      const participants = await loadPicks();
      return res.status(200).json({
        participants: participants || null,
        isDefault: !participants,
      });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  if (req.method === 'POST') {
    const { participants, pin } = req.body || {};
    const correctPin = String(process.env.POOL_PIN || '1234');
    if (String(pin) !== correctPin) {
      return res.status(403).json({ error: 'Incorrect PIN' });
    }
    if (!Array.isArray(participants) || participants.length === 0) {
      return res.status(400).json({ error: 'Invalid participants data' });
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
