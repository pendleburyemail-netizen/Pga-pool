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

function findInMap(pickName, golferMap) {
  const key = normalizeName(pickName);
  if (golferMap[key]) return golferMap[key];
  const lastName = key.split(' ').pop();
  return Object.values(golferMap).find(g =>
    g.nameKey.split(' ').pop() === lastName
  ) || null;
}

// replacement: { out: 'Old Player Name', in: 'New Player Name' } | null
// Replacement player scores only from R3 onwards (r3 + r4), ignoring R1+R2.
export function scoreParticipant(participant, golferMap, replacement = null) {
  const replacementInName = replacement?.in || null;
  const replacementOutName = replacement?.out || null;

  // Build effective pick list: remove the swapped-out player, add replacement
  const effectivePicks = participant.picks
    .filter(p => p && p !== replacementOutName)
    .concat(replacementInName ? [replacementInName] : []);

  const scoredPicks = effectivePicks.map(pickName => {
    if (!pickName) return { name: '', score: null, display: '', status: '', eliminated: false, isReplacement: false };

    const golfer = findInMap(pickName, golferMap);
    const isReplacement = pickName === replacementInName;

    if (!golfer) {
      return { name: pickName, score: null, display: '--', status: 'unknown', eliminated: false, isReplacement };
    }

    const eliminated = golfer.status === 'MC' || golfer.status === 'WD';

    if (eliminated) {
      return { name: pickName, score: null, display: golfer.displayTotal, status: golfer.status, eliminated: true, isReplacement };
    }

    if (isReplacement) {
      // Replacement player: only R3+R4 count — they start at E
      const r3 = golfer.r3 ?? null;
      const r4 = golfer.r4 ?? null;
      const score = (r3 !== null || r4 !== null)
        ? (r3 ?? 0) + (r4 ?? 0)
        : null;
      const display = score !== null ? formatScore(score) : '--';
      return {
        name: pickName,
        score,
        display,
        displaySuffix: '(R3+)',  // shown in UI to indicate partial scoring
        status: 'Active',
        eliminated: false,
        isReplacement: true,
      };
    }

    return {
      name:      pickName,
      score:     golfer.total,
      display:   golfer.displayTotal || formatScore(golfer.total),
      status:    golfer.status,
      eliminated: false,
      isReplacement: false,
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
