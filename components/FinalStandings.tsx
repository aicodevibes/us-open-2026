'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Trophy } from 'lucide-react';
import { motion } from 'motion/react';

interface Participant {
  id: string;
  name: string;
  players: string[];
}

interface PlayerScore {
  id: string;
  playerName: string;
  day1: number;
  day2: number;
  day3: number;
  day4: number;
  isCut?: boolean;
}

interface PlayoffScore {
  playerName: string;
  round4Holes: number[];
}

interface FinalStandingsProps {
  participants: Participant[];
  scores: Record<string, PlayerScore>;
  cutline: number | null;
  playoffScores: Record<string, PlayoffScore>;
  prizes: { rank: string; amount: string; value: number }[];
}

export function FinalStandings({ participants, scores, cutline, playoffScores, prizes }: FinalStandingsProps) {
  const isPlayerCut = (scoreData: PlayerScore | undefined) => {
    if (!scoreData) return true;
    if (cutline !== null && typeof scoreData.day1 === 'number' && typeof scoreData.day2 === 'number') {
      return (scoreData.day1 + scoreData.day2) > cutline;
    }
    return !!scoreData.isCut;
  };

  const calculateDailyScore = (participant: Participant, day: number) => {
    const dayKey = `day${day}` as 'day1' | 'day2' | 'day3' | 'day4';
    const playerScores = participant.players.map((p, index) => {
      const scoreData = scores[p];
      if (!scoreData) return (day === 3 || day === 4) ? 999 : 0;
      if (index >= 3 && (day === 1 || day === 2)) return 999;
      if ((day === 3 || day === 4) && isPlayerCut(scoreData)) return 999;
      
      const score = scoreData[dayKey];
      if (typeof score !== 'number') return (day === 3 || day === 4) ? 999 : 0;
      return score;
    });
    
    const sorted = [...playerScores].sort((a, b) => a - b);
    const s1 = sorted[0];
    const s2 = sorted[1];

    if (s1 === 999) return 0;
    if (s2 === 999) return s1;
    return s1 + s2;
  };

  const getParticipantStats = (participant: Participant) => {
    const d1 = calculateDailyScore(participant, 1);
    const d2 = calculateDailyScore(participant, 2);
    const d3 = calculateDailyScore(participant, 3);
    const d4 = calculateDailyScore(participant, 4);
    
    const activePlayersDay3 = participant.players.filter(p => !isPlayerCut(scores[p])).length;
    const isCut = activePlayersDay3 === 0;

    const total = d1 + d2 + d3 + d4;
    return { participant, total, isCut };
  };

  const sortedStats = participants.map(p => getParticipantStats(p)).sort((a, b) => {
    if (a.isCut && !b.isCut) return 1;
    if (!a.isCut && b.isCut) return -1;
    return a.total - b.total;
  });

  // Take Top 4 participants for final standings
  // We need to resolve ties
  
  // Tie breaking function
  const breakTie = (tiedGroup: typeof sortedStats) => {
    if (tiedGroup.length <= 1) return tiedGroup;
    
    // Sort within the tied group using hole-by-hole playoff logic
    return [...tiedGroup].sort((a, b) => {
      const getBestTwoPlayers = (p: typeof a) => {
        const pScores = p.participant.players.map(name => {
          const sd = scores[name];
          if (!sd || isPlayerCut(sd) || typeof sd.day4 !== 'number') return { name, score: 999 };
          return { name, score: sd.day4 };
        }).sort((x, y) => x.score - y.score);
        return [pScores[0]?.name, pScores[1]?.name].filter(Boolean);
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

        // If someone scored lower on this hole, they win the tiebreaker (go first)
        if (aHoleScore !== bHoleScore) {
          return aHoleScore - bHoleScore;
        }
      }
      
      // If still tied after 18 holes, keep them as is
      return 0;
    });
  };

  // Group all stats by total score to break ties correctly
  const scoreGroups = new Map<number, typeof sortedStats>();
  sortedStats.forEach(s => {
    if (!s.isCut) {
      const group = scoreGroups.get(s.total) || [];
      group.push(s);
      scoreGroups.set(s.total, group);
    }
  });

  let rankedParticipants: (typeof sortedStats[0] & { rank: number })[] = [];
  let currentRank = 1;

  const uniqueScores = Array.from(scoreGroups.keys()).sort((a, b) => a - b);
  for (const score of uniqueScores) {
    const group = scoreGroups.get(score)!;
    const resolvedGroup = breakTie(group);
    
    resolvedGroup.forEach((p, idx) => {
      rankedParticipants.push({ ...p, rank: currentRank + idx });
    });
    
    currentRank += group.length;
  }

  // Add cut players at the end
  sortedStats.filter(s => s.isCut).forEach(p => {
    rankedParticipants.push({ ...p, rank: -1 }); // -1 for Cut
  });

  const top4 = rankedParticipants.slice(0, 4);

  const getRankStyle = (rank: number) => {
    switch (rank) {
      case 1: return 'bg-[#FFD700] text-[#001A2E] font-black';
      case 2: return 'bg-[#C0C0C0] text-[#001A2E] font-black';
      case 3: return 'bg-[#CD7F32] text-white font-black';
      case 4: return 'bg-[#B87333] text-white font-black';
      default: return 'bg-[#F4F8FA] text-[#00365F]';
    }
  };

  const formatScore = (score: number) => {
    if (score === 0) return 'E';
    return score > 0 ? `+${score}` : score.toString();
  };

  return (
    <Card className="bg-white border-4 border-[#D4AF37] rounded-2xl shadow-2xl overflow-hidden mb-8">
      <CardHeader className="bg-[#00365F] text-white p-6 border-b-4 border-[#D4AF37]">
        <CardTitle className="text-2xl font-serif font-bold uppercase tracking-widest flex items-center gap-3">
          <Trophy className="w-8 h-8 text-[#D4AF37]" />
          Official Final Standings
        </CardTitle>
        <p className="text-[#D4AF37] text-sm uppercase tracking-widest font-bold mt-2">
          Tournament Complete
        </p>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader className="bg-[#F4F8FA]">
            <TableRow className="hover:bg-transparent border-b-2 border-[#00365F]/10">
              <TableHead className="text-[#00365F] font-bold uppercase text-[12px] w-20 text-center">Final Pos</TableHead>
              <TableHead className="text-[#00365F] font-bold uppercase text-[12px]">Participant</TableHead>
              <TableHead className="text-[#00365F] font-bold uppercase text-[12px] text-right">Total Score</TableHead>
              <TableHead className="text-[#00365F] font-bold uppercase text-[12px] text-right pr-8">Payout</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {top4.map((p, idx) => (
              <motion.tr 
                key={p.participant.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.1 }}
                className="border-b border-[#00365F]/10 hover:bg-[#00365F]/5 transition-colors"
              >
                <TableCell className="text-center py-6">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center mx-auto text-lg ${getRankStyle(p.rank)}`}>
                    {p.rank}
                  </div>
                </TableCell>
                <TableCell className="font-bold text-[#00365F] text-xl">
                  {p.participant.name}
                  {/* Note: In a real scenario, you'd calculate tie breaker holes here if ties were broken, but keeping UI clean for now */}
                </TableCell>
                <TableCell className="text-right font-bold text-2xl text-[#00365F]">
                  {formatScore(p.total)}
                </TableCell>
                <TableCell className="text-right font-black text-2xl text-[#D4AF37] pr-8">
                  {prizes[idx]?.amount || '$0.00'}
                </TableCell>
              </motion.tr>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
