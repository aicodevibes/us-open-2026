/**
 * @file components/LeaderboardTable.tsx
 * @description Renders the overall tournament standings table, highlighting rankings,
 * participant scores, and player-level round breakdowns.
 */

import { motion } from 'motion/react';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { TrendingDown } from 'lucide-react';

interface PlayerScore {
  id: string;
  playerName: string;
  day1: number;
  day2: number;
  day3: number;
  day4: number;
  isCut?: boolean;
}

interface ParticipantStats {
  id: string;
  name: string;
  players: string[];
  stats: {
    d1: number;
    d2: number;
    d3: number;
    d4: number;
    total: number;
    isCut: boolean;
  };
  rank: number | string;
  payout: number;
}

interface LeaderboardTableProps {
  allStats: ParticipantStats[];
  scores: Record<string, PlayerScore>;
  isPlayerCut: (scoreData: PlayerScore | undefined) => boolean;
  formatScore: (score: number | null | undefined) => string;
  playoffComplete: boolean;
}

/**
 * Returns CSS class names based on a standing's rank.
 * 
 * @param {number | string} rank - The rank number or 'C' for cut.
 * @returns {string} Tailwind CSS class list.
 */
const getRankStyle = (rank: number | string): string => {
  switch (rank) {
    case 1:
      return 'bg-[#FFD700] text-[#001A2E] font-black'; // Gold
    case 2:
      return 'bg-[#C0C0C0] text-[#001A2E] font-black'; // Silver
    case 3:
      return 'bg-[#CD7F32] text-white font-black'; // Bronze
    case 4:
      return 'bg-[#B87333] text-white font-black'; // Copper
    case 'C':
      return 'bg-red-50 text-red-500 border border-red-100 font-black'; // Cut
    default:
      return 'bg-[#F4F8FA] text-[#00365F]';
  }
};

/**
 * Standings Table showing the drafted teams, overall points, and round details.
 * 
 * @param {LeaderboardTableProps} props - The component props.
 * @returns {JSX.Element} The standings table card.
 */
export function LeaderboardTable({
  allStats,
  scores,
  isPlayerCut,
  formatScore,
  playoffComplete,
}: LeaderboardTableProps) {
  return (
    <section className={`bg-white rounded-2xl shadow-xl border border-[#00365F]/10 overflow-hidden ${playoffComplete ? 'opacity-50 grayscale transition-all duration-1000' : ''}`}>
      <div className="bg-[#00365F] text-white p-6 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <TrendingDown className="w-6 h-6 text-[#D4AF37]" />
          <h2 className="text-xl font-serif font-bold uppercase tracking-tight">Overall Standings</h2>
        </div>
        <Badge className="bg-[#001A2E] text-white border border-white/20">Live Feed</Badge>
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader className="bg-[#F4F8FA]">
            <TableRow className="hover:bg-transparent border-b-2 border-[#00365F]/10">
              <TableHead className="text-[#00365F] font-bold uppercase text-[12px] w-16 text-center">Pos</TableHead>
              <TableHead className="text-[#00365F] font-bold uppercase text-[12px]">Participant</TableHead>
              <TableHead className="text-[#00365F] font-bold uppercase text-[12px]">Drafted Players</TableHead>
              <TableHead className="text-[#00365F] font-bold uppercase text-[12px] text-center">R1</TableHead>
              <TableHead className="text-[#00365F] font-bold uppercase text-[12px] text-center">R2</TableHead>
              <TableHead className="text-[#00365F] font-bold uppercase text-[12px] text-center">R3</TableHead>
              <TableHead className="text-[#00365F] font-bold uppercase text-[12px] text-center">R4</TableHead>
              <TableHead className="text-[#00365F] font-bold uppercase text-[12px] text-right pr-8">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {allStats.map((p, idx) => (
              <motion.tr 
                key={p.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.05 }}
                className="border-b border-[#00365F]/5 hover:bg-[#00365F]/5 transition-colors group"
              >
                <TableCell className="text-center">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center mx-auto font-bold ${getRankStyle(p.rank)}`}>
                    {p.rank}
                  </div>
                </TableCell>
                <TableCell className="font-bold text-[#00365F] text-lg">
                  <div className="flex items-center gap-2">
                    {p.name}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-col gap-1">
                    {p.players.map((player, index) => (
                      <div key={player} className="text-[11px] flex justify-between gap-4 border-l-2 border-[#D4AF37] pl-2">
                        <span className="font-medium">
                          {player}
                          {isPlayerCut(scores[player]) && (
                            <span className="ml-1 text-[9px] font-bold text-red-500 uppercase bg-red-50 px-1 rounded border border-red-100">
                              Cut
                            </span>
                          )}
                        </span>
                        <span className="font-mono text-[#00365F] font-bold">
                          {scores[player] ? (
                            `${index >= 3 ? '-' : formatScore(scores[player].day1)}/${index >= 3 ? '-' : formatScore(scores[player].day2)}/${isPlayerCut(scores[player]) ? 'C' : formatScore(scores[player].day3)}/${isPlayerCut(scores[player]) ? 'C' : formatScore(scores[player].day4)}`
                          ) : 'E/E/E/E'}
                        </span>
                      </div>
                    ))}
                  </div>
                </TableCell>
                <TableCell className="text-center font-medium">{formatScore(p.stats.d1)}</TableCell>
                <TableCell className="text-center font-medium">{formatScore(p.stats.d2)}</TableCell>
                <TableCell className="text-center font-medium">{formatScore(p.stats.d3)}</TableCell>
                <TableCell className="text-center font-medium">{formatScore(p.stats.d4)}</TableCell>
                <TableCell className="text-right font-bold text-2xl text-[#00365F] pr-8">{formatScore(p.stats.total)}</TableCell>
              </motion.tr>
            ))}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}
