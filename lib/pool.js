// lib/pool.js — pure scoring logic, no React
//
// CUT DETECTION: ESPN removes cut players from the scoreboard after R2.
// A picked player absent from the golfer map once cutHasHappened=true
// has missed the cut. We detect by absence, not by a status flag.

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

function findInMap(pickName, golferMap) {
  const key = normalizeName(pickName);
  if (golferMap[key]) return golferMap[key];
  const lastName = key.split(' ').pop();
  return Object.values(golferMap).find(g =>
    g.nameKey.split(' ').pop() === lastName
  ) || null;
}

export function scoreParticipant(participant, golferMap) {
  const scoredPicks = participant.picks.map(pickName => {
    if (!pickName) return { name: '', score: null, display: '', status: '', eliminated: false };

    const golfer = findInMap(pickName, golferMap);

    if (!golfer) {
      // Not found in map at all — treat as unknown (shouldn't happen often)
      return { name: pickName, score: null, display: '--', status: 'unknown', eliminated: false };
    }

    // API now sets status:'MC' for cut players based on linescore count
    const eliminated = golfer.status === 'MC' || golfer.status === 'WD';

    return {
      name:      pickName,
      score:     eliminated ? null : golfer.total,
      display:   eliminated ? golfer.displayTotal : (golfer.displayTotal || formatScore(golfer.total)),
      status:    golfer.status,
      eliminated,
    };
  });

  const activeScores = scoredPicks
    .filter(p => !p.eliminated && p.score !== null)
    .map(p => p.score)
    .sort((a, b) => a - b);

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
