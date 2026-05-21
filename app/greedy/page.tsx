'use client';

import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { collection, onSnapshot, doc } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Trophy, DollarSign, Loader2, Info, Timer } from 'lucide-react';
import { motion } from 'motion/react';
import { GREEDY_PRIZE_POOL, TOURNAMENT_NAME } from '@/lib/constants';

/**
 * GreedyPage Component
 * 
 * A specialized "hidden" dashboard for a side-game during the US Open.
 * Features a separate roster of participants and a single-player-per-participant format.
 * Winner takes all ($175).
 */

interface Participant {
  id: string;
  name: string;
  player: string;
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

export default function GreedyPage() {
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [scores, setScores] = useState<Record<string, PlayerScore>>({});
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [loading, setLoading] = useState(true);
  const [connectionError, setConnectionError] = useState(false);

  useEffect(() => {
    // Listen to greedy participants
    const unsubP = onSnapshot(collection(db, 'usopen_greedyParticipants'), (snap) => {
      setParticipants(snap.docs.map(d => ({ id: d.id, ...d.data() } as Participant)));
      setLoading(false);
    }, (error) => {
      console.error('Firestore connection error (greedyParticipants):', error);
      setConnectionError(true);
      setLoading(false);
    });

    // Reuse the same playerScores collection
    const unsubS = onSnapshot(collection(db, 'usopen_playerScores'), (snap) => {
      const sMap: Record<string, PlayerScore> = {};
      snap.docs.forEach(d => {
        const data = d.data() as PlayerScore;
        sMap[data.playerName] = data;
      });
      setScores(sMap);
    }, (error) => {
      console.error('Firestore connection error (scores):', error);
      setConnectionError(true);
    });

    // Tournament config for timestamp
    const unsubC = onSnapshot(doc(db, 'usopen_config', 'tournament'), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        if (data.lastUpdated) {
          setLastUpdated(data.lastUpdated.toDate());
        }
      }
    });

    return () => {
      unsubP();
      unsubS();
      unsubC();
    };
  }, []);

  const formatScore = (score: number | null | undefined) => {
    if (score === 0) return 'E';
    if (score === null || score === undefined) return '-';
    return score > 0 ? `+${score}` : score.toString();
  };

  const getParticipantStats = (participant: Participant) => {
    const s = scores[participant.player];
    if (!s) return { d1: 0, d2: 0, d3: 0, d4: 0, total: 0, isCut: false };

    const d1 = s.day1 || 0;
    const d2 = s.day2 || 0;
    const d3 = s.day3 || 0;
    const d4 = s.day4 || 0;
    const total = d1 + d2 + d3 + d4;
    return { d1, d2, d3, d4, total, isCut: !!s.isCut };
  };

  const allStats = participants.map(p => ({
    ...p,
    stats: getParticipantStats(p)
  })).sort((a, b) => {
    if (a.stats.isCut && !b.stats.isCut) return 1;
    if (!a.stats.isCut && b.stats.isCut) return -1;
    return a.stats.total - b.stats.total;
  });

  const isOutrightLeader = (idx: number) => {
    if (idx !== 0) return false;
    if (allStats.length < 2) return true;
    return allStats[0].stats.total < allStats[1].stats.total && !allStats[0].stats.isCut;
  };

  if (connectionError) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#001A2E] text-white p-4">
        <h2 className="text-xl font-bold text-[#D4AF37]">Connection Error</h2>
        <p className="text-sm opacity-60 text-center">Unable to load the side game data. Please try again later.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#001A2E]">
        <Loader2 className="w-8 h-8 animate-spin text-[#D4AF37]" />
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-[#F4F8FA] text-[#001A2E] p-4 md:p-8 font-sans">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Header */}
        <header className="bg-[#00365F] text-white p-8 rounded-xl shadow-lg flex flex-col md:flex-row justify-between items-center gap-6 border-b-4 border-[#D4AF37]">
          <div className="flex items-center gap-6">
            <div className="w-16 h-16 bg-[#D4AF37] rounded-full flex items-center justify-center p-2">
              <DollarSign className="w-10 h-10 text-[#00365F]" />
            </div>
            <div>
              <h1 className="text-3xl md:text-5xl font-bold tracking-tighter uppercase font-serif">
                The Greedy Side Game
              </h1>
              <p className="text-[#D4AF37] font-bold tracking-widest uppercase text-xs">{TOURNAMENT_NAME}</p>
            </div>
          </div>
          <div className="text-center md:text-right bg-[#001A2E] p-3 rounded-lg border border-white/10 shrink-0">
            <p className="text-[10px] text-[#D4AF37] uppercase tracking-widest mb-1">Winner Takes All</p>
            <p className="text-3xl font-mono font-black text-white">{GREEDY_PRIZE_POOL}</p>
          </div>
        </header>

        {/* Leaderboard */}
        <section className="bg-white rounded-2xl shadow-xl border border-[#00365F]/10 overflow-hidden">
          <div className="bg-[#001A2E] text-white p-4 flex justify-between items-center border-b-2 border-[#D4AF37]">
            <h2 className="text-lg font-serif font-bold uppercase tracking-widest">Scoreboard</h2>
            <div className="flex items-center gap-2 text-[10px] uppercase opacity-60">
              <Timer className="w-3 h-3" />
              Updated: {lastUpdated ? lastUpdated.toLocaleTimeString() : '...'}
            </div>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-[#F4F8FA]">
                <TableRow className="hover:bg-transparent border-b-2 border-[#00365F]/10">
                  <TableHead className="text-[#00365F] font-bold uppercase text-[11px]">Participant</TableHead>
                  <TableHead className="text-[#00365F] font-bold uppercase text-[11px]">Assigned Player</TableHead>
                  <TableHead className="text-[#00365F] font-bold uppercase text-[11px] text-center">R1</TableHead>
                  <TableHead className="text-[#00365F] font-bold uppercase text-[11px] text-center">R2</TableHead>
                  <TableHead className="text-[#00365F] font-bold uppercase text-[11px] text-center">R3</TableHead>
                  <TableHead className="text-[#00365F] font-bold uppercase text-[11px] text-center">R4</TableHead>
                  <TableHead className="text-[#00365F] font-bold uppercase text-[11px] text-right pr-6">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {allStats.map((p, idx) => (
                  <motion.tr 
                    key={p.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.1 }}
                    className={`border-b border-[#00365F]/5 hover:bg-[#00365F]/5 transition-colors ${isOutrightLeader(idx) ? 'bg-[#D4AF37]/5' : ''}`}
                  >
                    <TableCell className="font-bold text-[#00365F]">
                      <div className="flex items-center gap-2">
                        {isOutrightLeader(idx) && <Trophy className="w-4 h-4 text-[#D4AF37]" />}
                        {p.name}
                      </div>
                    </TableCell>
                    <TableCell className="font-medium">
                      {p.player}
                      {p.stats.isCut && <Badge variant="destructive" className="ml-2 text-[8px] uppercase">Cut</Badge>}
                    </TableCell>
                    <TableCell className="text-center font-mono text-xs">{formatScore(p.stats.d1)}</TableCell>
                    <TableCell className="text-center font-mono text-xs">{formatScore(p.stats.d2)}</TableCell>
                    <TableCell className="text-center font-mono text-xs">{formatScore(p.stats.d3)}</TableCell>
                    <TableCell className="text-center font-mono text-xs">{formatScore(p.stats.d4)}</TableCell>
                    <TableCell className="text-right font-bold text-xl text-[#00365F] pr-6">
                      {formatScore(p.stats.total)}
                    </TableCell>
                  </motion.tr>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>

        <footer className="text-center space-y-2 opacity-50">
          <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] flex items-center justify-center gap-2">
            <Info className="w-3 h-3" />
            Greedy Game Rules
          </h3>
          <p className="text-[10px] max-w-lg mx-auto leading-relaxed">
            This is a separate winner-takes-all side game. Score is calculated based on the single assigned player&apos;s total tournament score to par. 
            In event of a tie, the standard tie-breaker rules will apply.
          </p>
        </footer>
      </div>
    </main>
  );
}
