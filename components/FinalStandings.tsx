import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Trophy } from 'lucide-react';
import { Participant, PlayerScore, PlayoffScore, Prize } from '@/types';
import { getParticipantStats, breakTie } from '@/lib/scoring';

interface FinalStandingsProps {
  participants: Participant[];
  scores: Record<string, PlayerScore>;
  cutline: number | null;
  playoffScores: Record<string, PlayoffScore>;
  prizes: Prize[];
}

export function FinalStandings({ participants, scores, cutline, playoffScores, prizes }: FinalStandingsProps) {
  const sortedStats = participants.map(p => {
    const stats = getParticipantStats(p, scores, cutline);
    return {
      participant: p,
      total: stats.total,
      isCut: stats.isCut
    };
  }).sort((a, b) => {
    if (a.isCut && !b.isCut) return 1;
    if (!a.isCut && b.isCut) return -1;
    return a.total - b.total;
  });

  // Group all stats by total score to break ties correctly
  const scoreGroups = new Map<number, typeof sortedStats>();
  sortedStats.forEach(s => {
    if (!s.isCut) {
      const group = scoreGroups.get(s.total) || [];
      group.push(s);
      scoreGroups.set(s.total, group);
    }
  });

  const rankedParticipants: (typeof sortedStats[0] & { rank: number })[] = [];
  let currentRank = 1;

  const uniqueScores = Array.from(scoreGroups.keys()).sort((a, b) => a - b);
  for (const score of uniqueScores) {
    const group = scoreGroups.get(score)!;
    const resolvedGroup = breakTie(group, scores, playoffScores, cutline);
    
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
      case 1: return 'bg-[#FFD700] text-[#05041a] font-black';
      case 2: return 'bg-[#C0C0C0] text-[#05041a] font-black';
      case 3: return 'bg-[#CD7F32] text-white font-black';
      case 4: return 'bg-[#B87333] text-white font-black';
      default: return 'bg-[#f8f9fa] text-[#06051e]';
    }
  };

  const formatScore = (score: number) => {
    if (score === 0) return 'E';
    return score > 0 ? `+${score}` : score.toString();
  };

  return (
    <Card className="bg-white border-4 border-[#ffba00] rounded-2xl shadow-2xl overflow-hidden mb-8">
      <CardHeader className="bg-[#06051e] text-white p-6 border-b-4 border-[#ffba00]">
        <CardTitle className="text-2xl font-serif font-bold uppercase tracking-widest flex items-center gap-3">
          <Trophy className="w-8 h-8 text-[#ffba00]" />
          Official Final Standings
        </CardTitle>
        <p className="text-[#ffba00] text-sm uppercase tracking-widest font-bold mt-2">
          Tournament Complete
        </p>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader className="bg-[#f8f9fa]">
            <TableRow className="hover:bg-transparent border-b-2 border-[#06051e]/10">
              <TableHead className="text-[#06051e] font-bold uppercase text-[12px] w-20 text-center">Final Pos</TableHead>
              <TableHead className="text-[#06051e] font-bold uppercase text-[12px]">Participant</TableHead>
              <TableHead className="text-[#06051e] font-bold uppercase text-[12px] text-right">Total Score</TableHead>
              <TableHead className="text-[#06051e] font-bold uppercase text-[12px] text-right pr-8">Payout</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {top4.map((p, idx) => (
              <TableRow 
                key={p.participant.id}
                className="border-b border-[#06051e]/10 hover:bg-[#06051e]/5 transition-colors"
              >
                <TableCell className="text-center py-6">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center mx-auto text-lg ${getRankStyle(p.rank)}`}>
                    {p.rank}
                  </div>
                </TableCell>
                <TableCell className="font-bold text-[#06051e] text-xl">
                  {p.participant.name}
                </TableCell>
                <TableCell className="text-right font-bold text-2xl text-[#06051e]">
                  {formatScore(p.total)}
                </TableCell>
                <TableCell className="text-right font-black text-2xl text-[#ffba00] pr-8">
                  {prizes[idx]?.amount || '$0.00'}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
