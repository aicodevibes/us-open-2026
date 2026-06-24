// lib/scoring.ts

import { Participant, PlayerScore, PlayoffScore, ParticipantStats, Prize } from '../types';

/**
 * Checks if a player has been cut from the tournament.
 */
export function isPlayerCut(scoreData: PlayerScore | undefined, cutline: number | null): boolean {
  if (!scoreData) return true; // If missing completely, treat as cut for safety
  if (cutline !== null && typeof scoreData.day1 === 'number' && typeof scoreData.day2 === 'number') {
    return (scoreData.day1 + scoreData.day2) > cutline;
  }
  return !!scoreData.isCut;
}

/**
 * Calculates a participant's score for a specific day.
 * It takes the sum of the lowest two scores of the drafted active players for that day.
 * Players cut on Day 3 or Day 4 receive a score of 999.
 * Player 4 only counts on Day 3 and 4.
 */
export function calculateDailyScore(
  participant: Participant,
  day: number,
  scores: Record<string, PlayerScore>,
  cutline: number | null
): number {
  const dayKey = `day${day}` as 'day1' | 'day2' | 'day3' | 'day4';
  const playerScores = participant.players.map((p, index) => {
    const scoreData = scores[p];
    
    // If player data is completely missing
    if (!scoreData) {
      return (day === 3 || day === 4) ? 999 : 0;
    }

    // If it's the 4th player or beyond, their scores only count on day 3 and 4
    if (index >= 3 && (day === 1 || day === 2)) {
      return 999;
    }

    // If it's day 3 or 4 and the player is cut, they don't count towards the lowest 2
    if ((day === 3 || day === 4) && isPlayerCut(scoreData, cutline)) {
      return 999; 
    }

    const score = scoreData[dayKey];
    // If the specific day's score is missing
    if (typeof score !== 'number') {
      return (day === 3 || day === 4) ? 999 : 0;
    }
    
    return score;
  });
  
  // Sort and take lowest 2
  const sorted = [...playerScores].sort((a, b) => a - b);
  
  const s1 = sorted[0];
  const s2 = sorted[1];

  if (s1 === 999) return 0; // No active players
  if (s2 === 999) return s1; // Only 1 active player
  
  return s1 + s2;
}

/**
 * Returns computed statistics for a single participant.
 */
export function getParticipantStats(
  participant: Participant,
  scores: Record<string, PlayerScore>,
  cutline: number | null
) {
  const d1 = calculateDailyScore(participant, 1, scores, cutline);
  const d2 = calculateDailyScore(participant, 2, scores, cutline);
  const d3 = calculateDailyScore(participant, 3, scores, cutline);
  const d4 = calculateDailyScore(participant, 4, scores, cutline);
  
  const activePlayersDay3 = participant.players.filter(p => !isPlayerCut(scores[p], cutline)).length;
  const isCut = activePlayersDay3 === 0;

  const total = d1 + d2 + d3 + d4;
  return { d1, d2, d3, d4, total, isCut };
}

/**
 * Computes overall standings, rankings, and payouts for all participants.
 */
export function computeParticipantStandings(
  participants: Participant[],
  scores: Record<string, PlayerScore>,
  cutline: number | null,
  prizes: Prize[]
): ParticipantStats[] {
  const PRIZE_POOLS = prizes.map(p => p.value);

  const sortedStats = participants.map(p => {
    const stats = getParticipantStats(p, scores, cutline);
    return {
      ...p,
      stats
    };
  }).sort((a, b) => {
    // Cut participants go to the bottom
    if (a.stats.isCut && !b.stats.isCut) return 1;
    if (!a.stats.isCut && b.stats.isCut) return -1;
    return a.stats.total - b.stats.total;
  });

  // Group by score to calculate payouts
  const scoreGroups = new Map<number, number>(); // score -> count
  sortedStats.forEach(p => {
    if (!p.stats.isCut) {
      scoreGroups.set(p.stats.total, (scoreGroups.get(p.stats.total) || 0) + 1);
    }
  });

  let currentPoolIndex = 0;
  const payouts = new Map<number, number>(); // score -> payout amount

  // Calculate payouts per score
  const uniqueScores = Array.from(scoreGroups.keys()).sort((a, b) => a - b);
  for (const score of uniqueScores) {
    const count = scoreGroups.get(score)!;
    let poolSum = 0;
    for (let i = 0; i < count; i++) {
      if (currentPoolIndex + i < PRIZE_POOLS.length) {
        poolSum += PRIZE_POOLS[currentPoolIndex + i];
      }
    }
    payouts.set(score, poolSum / count);
    currentPoolIndex += count;
  }

  return sortedStats.map((p) => {
    const rankIndex = sortedStats.findIndex(s => s.stats.total === p.stats.total);
    const rank = p.stats.isCut ? 'C' : rankIndex + 1;
    const payout = p.stats.isCut ? 0 : (payouts.get(p.stats.total) || 0);

    return {
      ...p,
      rank,
      payout
    };
  });
}

/**
 * Resolves scorecard playoff tie-breaker by sorting a tied group of participants
 * based on hole-by-hole scores of their best two day 4 players.
 */
export function breakTie(
  tiedGroup: { participant: Participant; total: number; isCut: boolean }[],
  scores: Record<string, PlayerScore>,
  playoffScores: Record<string, PlayoffScore>,
  cutline: number | null
): { participant: Participant; total: number; isCut: boolean }[] {
  if (tiedGroup.length <= 1) return tiedGroup;
  
  return [...tiedGroup].sort((a, b) => {
    const getBestTwoPlayers = (p: typeof a) => {
      const pScores = p.participant.players.map(name => {
        const sd = scores[name];
        if (!sd || isPlayerCut(sd, cutline) || typeof sd.day4 !== 'number') return { name, score: 999 };
        return { name, score: sd.day4 };
      }).sort((x, y) => x.score - y.score);
      return [pScores[0]?.name, pScores[1]?.name].filter(Boolean) as string[];
    };

    const aPlayers = getBestTwoPlayers(a);
    const bPlayers = getBestTwoPlayers(b);

    // Go hole by hole
    for (let h = 1; h <= 18; h++) {
      const holeIndex = h - 1;
      
      let aHoleScore = 0;
      let bHoleScore = 0;

      aPlayers.forEach(pName => {
        aHoleScore += playoffScores[pName]?.round4Holes?.[holeIndex] || 0;
      });
      
      bPlayers.forEach(pName => {
        bHoleScore += playoffScores[pName]?.round4Holes?.[holeIndex] || 0;
      });

      if (aHoleScore !== bHoleScore) {
        return aHoleScore - bHoleScore;
      }
    }
    
    return 0;
  });
}

/**
 * Finds the participants who won daily money for a specific day.
 */
export function getDayMoneyWinners(
  participants: Participant[],
  scores: Record<string, PlayerScore>,
  day: number,
  cutline: number | null,
  allStats: ParticipantStats[]
) {
  if (participants.length === 0 || Object.keys(scores).length === 0) return [];
  
  const dayKey = `day${day}` as keyof PlayerScore;
  
  // Find all active players for this day and their scores
  const activePlayersWithScores = Object.values(scores).filter(s => {
    if ((day === 3 || day === 4) && isPlayerCut(s, cutline)) return false;
    return typeof s[dayKey] === 'number';
  });

  if (activePlayersWithScores.length === 0) return [];

  // Only consider players who were actually drafted by participants AND eligible for this day
  const eligiblePlayerNames = new Set(
    participants.flatMap(p => 
      p.players.filter((_, index) => {
        if (index >= 3 && (day === 1 || day === 2)) return false;
        return true;
      })
    )
  );
  const draftedPlayersWithScores = activePlayersWithScores.filter(s => eligiblePlayerNames.has(s.playerName));

  if (draftedPlayersWithScores.length === 0) return [];

  // Find the absolute minimum and maximum score shot by any DRAFTED player today
  const dayScores = draftedPlayersWithScores.map(s => s[dayKey] as number);
  const minScore = Math.min(...dayScores);
  const maxScore = Math.max(...dayScores);
  
  // If everyone is at exactly 0, the day hasn't started yet (or no one has scored)
  if (minScore === 0 && maxScore === 0) {
    return [];
  }
  
  // Find which players shot this min score
  const winningPlayerNames = draftedPlayersWithScores
    .filter(s => s[dayKey] === minScore)
    .map(s => s.playerName);
    
  // Find participants who have at least one of these players AND the player is eligible
  return allStats.filter(p => 
    p.players.some((playerName, index) => {
      if (index >= 3 && (day === 1 || day === 2)) return false;
      return winningPlayerNames.includes(playerName);
    })
  ).map(p => ({
    ...p,
    dayBestScore: minScore
  }));
}
