// pages/api/results.js
// Generates a standalone self-contained HTML results page.
// Visit /api/results in your browser, then File → Save Page / Share → Download
// to get an HTML file that works offline and can be shared or archived.

import { PICKS_PER_PARTICIPANT, BEST_N, normalizeName, formatScore, buildGolferMap, scoreParticipant, rankParticipants } from '../../lib/pool';

const GIST_FILE = 'picks.json';

async function loadPicks() {
  if (!process.env.GIST_ID || !process.env.GITHUB_TOKEN) return null;
  try {
    const res = await fetch(`https://api.github.com/gists/${process.env.GIST_ID}`, {
      headers: { 'Authorization': `Bearer ${process.env.GITHUB_TOKEN}`, 'Accept': 'application/vnd.github+json' },
    });
    if (!res.ok) return null;
    const gist = await res.json();
    const raw = gist.files?.[GIST_FILE]?.content;
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // Support both old format (plain array) and new format ({ tournament, participants, replacements })
    if (Array.isArray(parsed) && parsed.length > 0) {
      return { participants: parsed, replacements: {} };
    }
    if (parsed?.participants?.length > 0) {
      return { participants: parsed.participants, replacements: parsed.replacements || {} };
    }
    return null;
  } catch { return null; }
}

async function loadScores(req) {
  try {
    // Call our own /api/scores which has all the correct event selection
    // and cut detection logic already built in
    const host = req.headers.host;
    const protocol = host.includes('localhost') ? 'http' : 'https';
    const res = await fetch(`${protocol}://${host}/api/scores`);
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}


function scoreColor(score) {
  if (score === null || score === undefined) return '#666';
  if (score < 0) return '#166534';
  if (score > 0) return '#991b1b';
  return '#333';
}
function medal(rank) { return ['🥇','🥈','🥉'][rank-1] || rank; }
function formatTotal(t) {
  if (t === null || t === undefined) return '--';
  if (t === 0) return 'E';
  return t > 0 ? `+${t}` : `${t}`;
}

function generateHTML(tournament, ranked, generatedAt) {
  const rows = ranked.map(p => {
    const sortedPicks = [...p.scoredPicks]
      .filter(sp => sp.name)
      .sort((a, b) => {
        if (a.eliminated && b.eliminated) return 0;
        if (a.eliminated) return 1;
        if (b.eliminated) return -1;
        if (a.score === null && b.score === null) return 0;
        if (a.score === null) return 1;
        if (b.score === null) return -1;
        return a.score - b.score;
      });

    const activePicks = sortedPicks.filter(sp => !sp.eliminated && sp.score !== null);
    const best4 = new Set(activePicks.slice(0, BEST_N).map(sp => sp.name));

    const pickRows = sortedPicks.map((sp, i) => {
      const counting = best4.has(sp.name);
      const bg = sp.eliminated ? '#f5f5f5' : counting ? '#fffbea' : '#fff';
      const color = sp.eliminated ? '#999' : scoreColor(sp.score);
      const strike = sp.eliminated ? 'line-through' : 'none';
      const scoreDisplay = sp.eliminated
        ? `<span style="background:#f3f4f6;color:#6b7280;border-radius:3px;padding:1px 5px;font-size:0.75rem;font-weight:bold">${sp.status === 'WD' ? 'WD' : 'CUT'}</span>`
        : `<span style="color:${color};font-weight:bold">${sp.score !== null ? sp.display : '--'}</span>`;
      return `<tr style="background:${bg};border-top:1px solid #eee">
        <td style="padding:5px 8px;color:#aaa;font-size:0.75rem">${i+1}</td>
        <td style="padding:5px 8px;color:${sp.eliminated?'#999':'#222'};text-decoration:${strike};font-weight:${counting?'bold':'normal'}">${sp.name}</td>
        <td style="padding:5px 8px;text-align:center">${scoreDisplay}</td>
      </tr>`;
    }).join('');

    const headerBg = p.rank===1?'#B8860B':p.rank===2?'#888':p.rank===3?'#8B4513':'#2E6B3E';
    const totalColor = p.total<0?'#7fff7f':p.total>0?'#ffaaaa':'#fff';
    const activeLessThan4 = p.activeCount > 0 && p.activeCount < BEST_N;

    return `
    <div style="background:#fff;border:${p.rank<=3?`2px solid ${headerBg}`:'1px solid #e0e0e0'};border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08)">
      <div style="background:${headerBg};color:#fff;padding:8px 14px;display:flex;align-items:center;gap:10px">
        <span style="font-size:1.3rem">${medal(p.rank)}</span>
        <span style="font-weight:bold;font-size:1rem;flex:1">${p.name}</span>
        <span style="font-size:1.2rem;font-weight:bold;color:${totalColor}">${p.total!==null?formatTotal(p.total):'--'}</span>
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:0.82rem">
        <thead><tr style="background:#f5f5f5">
          <th style="padding:4px 8px;text-align:left;font-weight:600;color:#555;width:24px">#</th>
          <th style="padding:4px 8px;text-align:left;font-weight:600;color:#555">Golfer</th>
          <th style="padding:4px 8px;text-align:center;font-weight:600;color:#555;width:64px">Score</th>
        </tr></thead>
        <tbody>${pickRows}</tbody>
      </table>
      ${activeLessThan4 ? `<div style="padding:5px 10px;font-size:0.7rem;color:#b45309;background:#fffbeb;border-top:1px solid #fde68a">⚠️ Only ${p.activeCount} of ${PICKS_PER_PARTICIPANT} picks still in the tournament</div>` : ''}
    </div>`;
  }).join('\n');

  const date = new Date(generatedAt).toLocaleString('en-CA', {
    weekday:'long', year:'numeric', month:'long', day:'numeric',
    hour:'2-digit', minute:'2-digit', timeZoneName:'short'
  });

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${tournament.name} — Pool Results</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:Georgia,'Times New Roman',serif;background:#f0ede6;color:#333;min-height:100vh}
  .header{background:linear-gradient(135deg,#1B4F2A,#2E6B3E);color:#fff;padding:20px 24px;text-align:center}
  .header h1{color:#F7E87C;font-size:1.5rem;margin-bottom:6px}
  .header .sub{font-size:0.85rem;color:#9dc9a5;line-height:1.6}
  .badge{display:inline-block;padding:3px 10px;border-radius:12px;font-size:0.75rem;font-weight:bold;margin-left:8px}
  .badge-final{background:#e2e8f0;color:#475569}
  .badge-live{background:#4ade80;color:#14532d}
  .content{max-width:1100px;margin:0 auto;padding:20px 12px 48px}
  .legend{font-size:0.78rem;color:#666;margin-bottom:12px}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px}
  .footer{text-align:center;margin-top:32px;font-size:0.75rem;color:#999;border-top:1px solid #ddd;padding-top:16px}
  @media print{body{background:#fff}.header{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
</style>
</head>
<body>
<div class="header">
  <h1>⛳ ${tournament.name}</h1>
  <div class="sub">
    ${tournament.venue ? `📍 ${tournament.venue}${tournament.location ? `, ${tournament.location}` : ''}` : ''}
    <span class="badge ${tournament.isFinal ? 'badge-final' : 'badge-live'}">${tournament.isFinal ? '✅ Final' : '🔴 In Progress'}</span>
    <br>Pool Results · Best ${BEST_N} of ${PICKS_PER_PARTICIPANT} picks count · CUT/WD = eliminated
  </div>
</div>
<div class="content">
  <div class="legend">🟨 highlighted picks count toward total · strikethrough = eliminated · lower score wins</div>
  <div class="grid">${rows}</div>
  <div class="footer">
    Generated ${date}<br>
    🏆 highlighted = counting toward total &nbsp;·&nbsp; CUT/WD players not counted
  </div>
</div>
</body>
</html>`;
}

export default async function handler(req, res) {
  // Load picks and scores in parallel
  const [picksData, scoresData] = await Promise.all([loadPicks(), loadScores(req)]);
  const participants = picksData?.participants || null;
  const replacements = picksData?.replacements || {};

  if (!participants) {
    return res.status(404).send('<h2>No picks found — save picks first via the pool app.</h2>');
  }
  if (!scoresData) {
    return res.status(502).send('<h2>Could not load scores from ESPN.</h2>');
  }

  const { tournament, cutHasHappened, golfers } = scoresData;
  const golferMap = buildGolferMap(golfers);

  const scored = participants
    .filter(p => p.name && p.picks?.some(Boolean))
    .map(p => scoreParticipant(p, golferMap, replacements[p.id] || null));

  const ranked = rankParticipants(scored);
  const html = generateHTML(tournament, ranked, new Date().toISOString());

  // Build a clean filename: e.g. "RBC-Canadian-Open-2026-Results.html"
  const safeName = (tournament.name || 'PGA-Tour')
    .replace(/[^a-zA-Z0-9 ]/g, '')
    .trim()
    .replace(/\s+/g, '-');
  const year = new Date().getFullYear();
  const filename = `${safeName}-${year}-Results.html`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).send(html);
}
