/**
 * @file components/PlayerScoreboard.tsx
 * @description Displays two tables side-by-side or stacked:
 * 1. Top 10 Players overall in the tournament (drafted or undrafted).
 * 2. Other Drafted Players (excluding those already in the top 10 list).
 */

import { Trophy } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

interface PlayerRanking {
  playerName: string;
  rank: number | string;
  total: number;
  isCut: boolean;
}

interface PlayerScoreboardProps {
  top10Players: PlayerRanking[];
  otherDraftedPlayers: PlayerRanking[];
  draftedBy: Map<string, string>;
  formatScore: (score: number | null | undefined) => string;
  playoffComplete: boolean;
}

/**
 * PlayerScoreboard component that lists Top 10 and other drafted players.
 * 
 * @param {PlayerScoreboardProps} props - Component props.
 * @returns {JSX.Element} The player scoreboard dashboard section.
 */
export function PlayerScoreboard({
  top10Players,
  otherDraftedPlayers,
  draftedBy,
  formatScore,
  playoffComplete,
}: PlayerScoreboardProps) {
  return (
    <section className={`grid grid-cols-1 lg:grid-cols-2 gap-6 ${playoffComplete ? 'opacity-50 grayscale transition-all duration-1000' : ''}`}>
      {/* Top 10 Players */}
      <Card className="bg-white border-2 border-[#00365F]/10 rounded-xl shadow-sm overflow-hidden flex flex-col">
        <CardHeader className="p-4 bg-[#00365F] text-white shrink-0">
          <CardTitle className="text-sm uppercase tracking-widest flex items-center gap-2">
            <Trophy className="w-4 h-4 text-[#D4AF37]" />
            Top 10 Players
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0 overflow-y-auto max-h-[400px]">
          <Table>
            <TableHeader className="bg-[#F4F8FA] sticky top-0 z-10 shadow-sm">
              <TableRow className="hover:bg-transparent border-b border-[#00365F]/10">
                <TableHead className="w-12 text-center text-[#00365F] font-bold text-xs uppercase">Pos</TableHead>
                <TableHead className="text-[#00365F] font-bold text-xs uppercase">Player</TableHead>
                <TableHead className="text-[#00365F] font-bold text-xs uppercase">Drafted By</TableHead>
                <TableHead className="text-right pr-4 text-[#00365F] font-bold text-xs uppercase">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {top10Players.map(p => (
                <TableRow key={p.playerName} className="hover:bg-[#00365F]/5 border-b border-[#00365F]/5">
                  <TableCell className="text-center font-bold text-[#00365F]">{p.rank}</TableCell>
                  <TableCell className="font-medium text-[#001A2E]">
                    {p.playerName}
                    {p.isCut && <Badge variant="destructive" className="ml-2 text-[8px] uppercase">Cut</Badge>}
                  </TableCell>
                  <TableCell>
                    {draftedBy.has(p.playerName) ? (
                      <Badge className="bg-[#001A2E] text-[#D4AF37] hover:bg-[#001A2E] text-[10px]">
                        {draftedBy.get(p.playerName)}
                      </Badge>
                    ) : (
                      <span className="text-xs text-gray-400 italic">Undrafted</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-bold text-[#00365F] pr-4">{formatScore(p.total)}</TableCell>
                </TableRow>
              ))}
              {top10Players.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-8 text-gray-500 italic">
                    Waiting for scores...
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Other Drafted Players */}
      <Card className="bg-white border-2 border-[#00365F]/10 rounded-xl shadow-sm overflow-hidden flex flex-col">
        <CardHeader className="p-4 bg-[#001A2E] text-white shrink-0">
          <CardTitle className="text-sm uppercase tracking-widest flex items-center gap-2">
            <Trophy className="w-4 h-4 text-white/50" />
            Other Drafted Players
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0 overflow-y-auto max-h-[400px]">
          <Table>
            <TableHeader className="bg-[#F4F8FA] sticky top-0 z-10 shadow-sm">
              <TableRow className="hover:bg-transparent border-b border-[#00365F]/10">
                <TableHead className="w-12 text-center text-[#00365F] font-bold text-xs uppercase">Pos</TableHead>
                <TableHead className="text-[#00365F] font-bold text-xs uppercase">Player</TableHead>
                <TableHead className="text-[#00365F] font-bold text-xs uppercase">Drafted By</TableHead>
                <TableHead className="text-right pr-4 text-[#00365F] font-bold text-xs uppercase">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {otherDraftedPlayers.map(p => (
                <TableRow key={p.playerName} className="hover:bg-[#00365F]/5 border-b border-[#00365F]/5">
                  <TableCell className="text-center font-bold text-[#00365F]">{p.rank}</TableCell>
                  <TableCell className="font-medium text-[#001A2E]">
                    {p.playerName}
                    {p.isCut && <Badge variant="destructive" className="ml-2 text-[8px] uppercase">Cut</Badge>}
                  </TableCell>
                  <TableCell>
                    <Badge className="bg-[#001A2E] text-[#D4AF37] hover:bg-[#001A2E] text-[10px]">
                      {draftedBy.get(p.playerName)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-bold text-[#00365F] pr-4">{formatScore(p.total)}</TableCell>
                </TableRow>
              ))}
              {otherDraftedPlayers.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-8 text-gray-500 italic">
                    No other drafted players.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </section>
  );
}
