// pages/api/picks.js
// Stores pool picks in Vercel Blob as a JSON file.
// Uses BLOB_STORE_ID (OIDC auth — current Vercel standard).

import { put, list, del } from '@vercel/blob';

const PICKS_PATHNAME = 'pga-pool-picks.json';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const hasBlobStoreId = !!process.env.BLOB_STORE_ID;
  const hasBlobToken   = !!process.env.BLOB_READ_WRITE_TOKEN;

  if (!hasBlobStoreId && !hasBlobToken) {
    return res.status(503).json({
      error: 'Blob not configured — BLOB_STORE_ID missing',
      env: { hasBlobStoreId, hasBlobToken, hasPoolPin: !!process.env.POOL_PIN },
    });
  }

  // ── GET ─────────────────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    try {
      const { blobs } = await list({ prefix: PICKS_PATHNAME });
      if (!blobs || blobs.length === 0) {
        return res.status(200).json({ participants: null, isDefault: true });
      }
      // Fetch the blob content via its URL
      const blob = blobs[0];
      const url  = blob.downloadUrl || blob.url;
      const r    = await fetch(url);
      if (!r.ok) throw new Error(`Blob fetch failed: ${r.status}`);
      const participants = await r.json();
      return res.status(200).json({ participants, isDefault: false });
    } catch (e) {
      console.error('GET /api/picks error:', e);
      return res.status(500).json({ error: e.message });
    }
  }

  // ── POST ────────────────────────────────────────────────────────────────────
  if (req.method === 'POST') {
    const { participants, pin } = req.body || {};

    // PIN check
    const correctPin = String(process.env.POOL_PIN || '1234');
    if (String(pin) !== correctPin) {
      return res.status(403).json({ error: 'Incorrect PIN' });
    }

    if (!Array.isArray(participants) || participants.length === 0) {
      return res.status(400).json({ error: 'Invalid participants data' });
    }

    try {
      // Delete old version first to avoid URL proliferation
      try {
        const { blobs } = await list({ prefix: PICKS_PATHNAME });
        for (const b of blobs) await del(b.url);
      } catch {}

      // Write new version
      const blob = await put(PICKS_PATHNAME, JSON.stringify(participants), {
        access: 'public',
        contentType: 'application/json',
        addRandomSuffix: false,
      });

      return res.status(200).json({ ok: true, url: blob.url });
    } catch (e) {
      console.error('POST /api/picks error:', e.message, e.stack);
      return res.status(500).json({
        error: e.message,
        type: e.constructor?.name,
      });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
