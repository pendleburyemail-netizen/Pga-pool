// lib/pool.js — pure scoring logic, no React

export const MC_WD_PENALTY = 20;
export const PICKS_PER_PARTICIPANT = 6;
export const BEST_N = 4; // best N of 6 count

export function normalizeName(name) {
  return name
    .toLowerCase()
    .replace(/[áàâä]/g, 'a').replace(/[éèêë]/g, 'e')
    .replace(/[íìîï]/g, 'i').replace(/[óòôö]/g, 'o')
    .replace(/[úùûü]/g, 'u').replace(/[ñ]/g, 'n')
    .replace(/[ç]/g, 'c').replace(/[ý]/g, 'y')
    .replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
}

export function formatScore(score) {
  if (score === null || score === undefined) return '--';
  if (score === 0) return 'E';
  return score > 0 ? `+${score}` : `${score}`;
}

export function buildGolferMap(golfers) {
  const map = {};
  for (const g of golfers) map[g.nameKey] = g;
  return map;
}

function findByLastName(normalizedKey, golferMap) {
  const lastName = normalizedKey.split(' ').pop();
  return Object.values(golferMap).find(g => {
    const parts = g.nameKey.split(' ');
    return parts[parts.length - 1] === lastName;
  });
}

export function scoreParticipant(participant, golferMap) {
  const scoredPicks = participant.picks.map(pickName => {
    if (!pickName) return { name: '', score: null, display: '--', status: '' };
    const key = normalizeName(pickName);
    const golfer = golferMap[key] || findByLastName(key, golferMap);
    if (!golfer) return { name: pickName, score: null, display: '--', status: 'unknown' };

    const score =
      golfer.status === 'MC' || golfer.status === 'WD'
        ? MC_WD_PENALTY
        : golfer.total;

    return {
      name: pickName,
      score,
      display: golfer.displayTotal || formatScore(score),
      status: golfer.status,
      position: golfer.position,
    };
  });

  const validScores = scoredPicks
    .map(p => p.score)
    .filter(s => s !== null && s !== undefined)
    .sort((a, b) => a - b);

  const best4 = validScores.slice(0, BEST_N);
  const total = best4.length > 0 ? best4.reduce((a, b) => a + b, 0) : null;

  return { ...participant, scoredPicks, total, best4Count: best4.length };
}

export function rankParticipants(participants) {
  const sorted = [...participants].sort((a, b) => {
    if (a.total === null && b.total === null) return 0;
    if (a.total === null) return 1;
    if (b.total === null) return -1;
    return a.total - b.total;
  });

  let rank = 1;
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i].total !== sorted[i - 1].total) rank = i + 1;
    sorted[i].rank = sorted[i].total !== null ? rank : '--';
  }
  return sorted;
}
