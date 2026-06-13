// lib/pool.js — pure scoring logic, no React

export const PICKS_PER_PARTICIPANT = 8;
export const BEST_N = 4;

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
    if (!pickName) return { name: '', score: null, display: '', status: '', eliminated: false };

    const key    = normalizeName(pickName);
    const golfer = golferMap[key] || findByLastName(key, golferMap);

    if (!golfer) {
      return { name: pickName, score: null, display: '--', status: 'unknown', eliminated: false };
    }

    const eliminated = golfer.status === 'MC' || golfer.status === 'WD';

    // Display: for eliminated players always show their status, never a score
    const display = eliminated
      ? (golfer.status === 'WD' ? 'WD' : 'CUT')
      : (golfer.displayTotal || formatScore(golfer.total));

    return {
      name:      pickName,
      score:     eliminated ? null : golfer.total,
      display,
      status:    golfer.status,
      eliminated,
    };
  });

  // Active picks only, sorted best (lowest) first
  const activeScores = scoredPicks
    .filter(p => !p.eliminated && p.score !== null && p.score !== undefined)
    .map(p => p.score)
    .sort((a, b) => a - b);

  // Take the best (lowest) BEST_N scores from non-eliminated picks.
  // Never more than BEST_N. Only fewer if 5+ of the 8 picks are eliminated.
  // Ties at the 4th spot: sort is stable so the first encountered is taken — consistent each run.
  const counting    = activeScores.slice(0, BEST_N);
  const total       = counting.length > 0 ? counting.reduce((a, b) => a + b, 0) : null;
  const activeCount = counting.length;

  return { ...participant, scoredPicks, total, activeCount };
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
