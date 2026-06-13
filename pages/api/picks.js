// pages/api/picks.js
// Stores pool picks as a JSON file in Vercel Blob storage.
// All devices read the same file — picks are shared across everyone.
//
// GET  /api/picks  — load current picks
// POST /api/picks  — save picks (requires POOL_PIN env var)
//
// SETUP (one-time in Vercel dashboard):
//   1. Project → Storage → Create Database → Blob → Create
//      Vercel auto-adds BLOB_READ_WRITE_TOKEN to your env vars.
//   2. Project → Settings → Environment Variables →
//      Add POOL_PIN = your chosen PIN (e.g. 1234)

import { put, list, getDownloadUrl } from '@vercel/blob';

const PICKS_PATHNAME = 'pga-pool-picks.json';

// ── GET — load picks ──────────────────────────────────────────────────────────
async function loadPicks() {
  try {
    // Find the picks file in blob storage
    const { blobs } = await list({ prefix: PICKS_PATHNAME });
    if (!blobs || blobs.length === 0) return null;

    // Fetch the content of the most recent one
    const blob = blobs[0];
    const res = await fetch(blob.downloadUrl);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// ── POST — save picks ─────────────────────────────────────────────────────────
async function savePicks(participants) {
  await put(PICKS_PATHNAME, JSON.stringify(participants), {
    access: 'public',
    allowOverwrite: true,
    contentType: 'application/json',
    addRandomSuffix: false,
  });
}

// ── Handler ───────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return res.status(503).json({
      error: 'Blob store not configured. In Vercel: go to Storage → Create Database → Blob, then redeploy.',
    });
  }

  if (req.method === 'GET') {
    const picks = await loadPicks();
    if (!picks) {
      return res.status(200).json({ participants: null, isDefault: true });
    }
    return res.status(200).json({ participants: picks, isDefault: false });
  }

  if (req.method === 'POST') {
    const { participants, pin } = req.body || {};

    const correctPin = process.env.POOL_PIN || '1234';
    if (String(pin) !== String(correctPin)) {
      return res.status(403).json({ error: 'Incorrect PIN' });
    }

    if (!Array.isArray(participants) || participants.length === 0) {
      return res.status(400).json({ error: 'Invalid participants data' });
    }

    try {
      await savePicks(participants);
      return res.status(200).json({ ok: true });
    } catch (e) {
      console.error('Blob save error:', e);
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
