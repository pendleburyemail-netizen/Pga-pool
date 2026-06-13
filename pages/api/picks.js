// pages/api/picks.js
// Stores pool picks as a JSON file in Vercel Blob storage.
// Uses BLOB_STORE_ID + VERCEL_OIDC_TOKEN (current Vercel auth method).
// Falls back to BLOB_READ_WRITE_TOKEN if present (legacy).
//
// GET  /api/picks  — load current picks (all devices)
// POST /api/picks  — save picks (requires POOL_PIN)

import { put, list } from '@vercel/blob';

const PICKS_PATHNAME = 'pga-pool-picks.json';

function isConfigured() {
  return !!(process.env.BLOB_STORE_ID || process.env.BLOB_READ_WRITE_TOKEN);
}

async function loadPicks() {
  try {
    const { blobs } = await list({ prefix: PICKS_PATHNAME });
    if (!blobs || blobs.length === 0) return null;
    const blob = blobs[0];
    const res = await fetch(blob.downloadUrl);
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    console.error('Blob load error:', e);
    return null;
  }
}

async function savePicks(participants) {
  await put(PICKS_PATHNAME, JSON.stringify(participants), {
    access: 'public',
    allowOverwrite: true,
    contentType: 'application/json',
    addRandomSuffix: false,
  });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  // Debug info to help diagnose env var issues
  const envDebug = {
    hasBlobStoreId: !!process.env.BLOB_STORE_ID,
    hasBlobToken: !!process.env.BLOB_READ_WRITE_TOKEN,
    hasOidcToken: !!process.env.VERCEL_OIDC_TOKEN,
    hasPoolPin: !!process.env.POOL_PIN,
  };

  if (!isConfigured()) {
    return res.status(503).json({
      error: 'Blob not configured',
      hint: 'BLOB_STORE_ID not found. Check Storage is connected to this project in Vercel dashboard.',
      env: envDebug,
    });
  }

  if (req.method === 'GET') {
    try {
      const picks = await loadPicks();
      return res.status(200).json({
        participants: picks || null,
        isDefault: !picks,
        env: envDebug,
      });
    } catch (e) {
      return res.status(500).json({ error: e.message, env: envDebug });
    }
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
      return res.status(500).json({ error: e.message, env: envDebug });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
