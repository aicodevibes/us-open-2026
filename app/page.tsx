'use client';

import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { collection, onSnapshot, doc } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Trophy, DollarSign, Loader2, Info, RefreshCw, Wallet } from 'lucide-react';
import { FinalStandings } from '@/components/FinalStandings';
import { PRIZES, DAILY_BONUSES } from '@/lib/constants';
import { Countdown } from '@/components/Countdown';
import { LeaderboardTable } from '@/components/LeaderboardTable';
import { PlayerScoreboard } from '@/components/PlayerScoreboard';

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

/**
 * Dashboard Component
 * 
 * The main public page for the US Open 2026 Golf Tournament Draft.
 * Renders live leaderboard standings, team detail breakdowns, Top 10 players,
 * and current payouts based on live scores retrieved from ESPN.
 * 
 * @returns {JSX.Element} The rendered tournament dashboard.
 */
export default function Dashboard() {
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [scores, setScores] = useState<Record<string, PlayerScore>>({});
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [cutline, setCutline] = useState<number | null>(null);
  const [playoffComplete, setPlayoffComplete] = useState<boolean>(false);
  const [playoffScores, setPlayoffScores] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [connectionError, setConnectionError] = useState(false);

  useEffect(() => {
    const unsubP = onSnapshot(collection(db, 'usopen_participants'), (snap) => {
      setParticipants(snap.docs.map(d => ({ id: d.id, ...d.data() } as Participant)));
      setLoading(false);
      setConnectionError(false);
    }, (error) => {
      console.error('Firestore connection error (participants):', error);
      setConnectionError(true);
      setLoading(false);
    });

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

    const unsubC = onSnapshot(doc(db, 'usopen_config', 'tournament'), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        if (data.lastUpdated) {
          setLastUpdated(data.lastUpdated.toDate());
        }
        if (data.cutline !== undefined) {
          setCutline(data.cutline);
        }
        if (data.playoffComplete !== undefined) {
          setPlayoffComplete(data.playoffComplete);
        }
      }
    }, (error) => {
      console.error('Firestore connection error (config):', error);
      setConnectionError(true);
    });

    return () => {
      unsubP();
      unsubS();
      unsubC();
    };
  }, []);

  // Only subscribe to playoffScores when playoff is complete
  useEffect(() => {
    if (!playoffComplete) return;

    const unsubPS = onSnapshot(collection(db, 'usopen_playoffScores'), (snap) => {
      const psMap: Record<string, any> = {};
      snap.docs.forEach(d => {
        psMap[d.id] = d.data();
      });
      setPlayoffScores(psMap);
    }, (error) => {
      console.error('Firestore connection error (playoffScores):', error);
    });

    return () => unsubPS();
  }, [playoffComplete]);

  const formatScore = (score: number | null | undefined) => {
    if (score === 0) return 'E';
    if (score === null || score === undefined) return '-';
    return score > 0 ? `+${score}` : score.toString();
  };

  const isPlayerCut = (scoreData: PlayerScore | undefined) => {
    if (!scoreData) return true; // If missing completely, treat as cut for safety
    if (cutline !== null && typeof scoreData.day1 === 'number' && typeof scoreData.day2 === 'number') {
      return (scoreData.day1 + scoreData.day2) > cutline;
    }
    return !!scoreData.isCut;
  };

  const calculateDailyScore = (participant: Participant, day: number) => {
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
      if ((day === 3 || day === 4) && isPlayerCut(scoreData)) {
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
    
    // If we are on day 3 or 4 and have fewer than 2 active players, 
    // we return a high score to indicate they aren't competitive if they haven't been assigned a replacement
    // But the user said they will assign a second player.
    // So if they have 1 player, and we take top 2, the second one will be 999.
    
    const s1 = sorted[0];
    const s2 = sorted[1];

    if (s1 === 999) return 0; // No active players
    if (s2 === 999) return s1; // Only 1 active player (should be fixed by admin assignment)
    
    return s1 + s2;
  };

  const getParticipantStats = (participant: Participant) => {
    const d1 = calculateDailyScore(participant, 1);
    const d2 = calculateDailyScore(participant, 2);
    const d3 = calculateDailyScore(participant, 3);
    const d4 = calculateDailyScore(participant, 4);
    
    // Check if participant is cut (all players cut after day 2)
    const activePlayersDay3 = participant.players.filter(p => !isPlayerCut(scores[p])).length;
    const isCut = activePlayersDay3 === 0;

    const total = d1 + d2 + d3 + d4;
    return { d1, d2, d3, d4, total, isCut };
  };

  const PRIZE_POOLS = PRIZES.map(p => p.value);

  const sortedStats = participants.map(p => ({
    ...p,
    stats: getParticipantStats(p)
  })).sort((a, b) => {
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

  const allStats = sortedStats.map((p, index) => {
    const rankIndex = sortedStats.findIndex(s => s.stats.total === p.stats.total);
    const rank = p.stats.isCut ? 'C' : rankIndex + 1;
    const payout = p.stats.isCut ? 0 : (payouts.get(p.stats.total) || 0);

    return {
      ...p,
      rank,
      payout
    };
  });

  const getRankStyle = (rank: number | string) => {
    switch (rank) {
      case 1: return 'bg-[#FFD700] text-[#001A2E] font-black'; // Gold
      case 2: return 'bg-[#C0C0C0] text-[#001A2E] font-black'; // Silver
      case 3: return 'bg-[#CD7F32] text-white font-black'; // Bronze
      case 4: return 'bg-[#B87333] text-white font-black'; // Copper
      case 'C': return 'bg-red-50 text-red-500 border border-red-100 font-black'; // Cut
      default: return 'bg-[#F4F8FA] text-[#00365F]';
    }
  };

  const getDayMoneyWinners = (day: number) => {
    if (participants.length === 0 || Object.keys(scores).length === 0) return [];
    
    const dayKey = `day${day}` as keyof PlayerScore;
    
    // 1. Find all active players for this day and their scores
    const activePlayersWithScores = Object.values(scores).filter(s => {
      // If it's day 3 or 4, ignore cut players
      if ((day === 3 || day === 4) && isPlayerCut(s)) return false;
      return typeof s[dayKey] === 'number';
    });

    if (activePlayersWithScores.length === 0) return [];

    // 1.5 Only consider players who were actually drafted by participants AND eligible for this day
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

    // 2. Find the absolute minimum and maximum score shot by any DRAFTED player today
    const dayScores = draftedPlayersWithScores.map(s => s[dayKey] as number);
    const minScore = Math.min(...dayScores);
    const maxScore = Math.max(...dayScores);
    
    // If everyone is at exactly 0, the day hasn't started yet (or no one has scored)
    if (minScore === 0 && maxScore === 0) {
      return [];
    }
    
    // 3. Find which players shot this min score
    const winningPlayerNames = draftedPlayersWithScores
      .filter(s => s[dayKey] === minScore)
      .map(s => s.playerName);
      
    // 4. Find participants who have at least one of these players AND the player is eligible
    return allStats.filter(p => 
      p.players.some((playerName, index) => {
        if (index >= 3 && (day === 1 || day === 2)) return false;
        return winningPlayerNames.includes(playerName);
      })
    ).map(p => ({
      ...p,
      dayBestScore: minScore
    }));
  };

  // --- NEW LOGIC FOR PLAYER SCOREBOARD ---
  const draftedBy = new Map<string, string>();
  participants.forEach(p => {
    p.players.forEach(player => {
      draftedBy.set(player, p.name);
    });
  });

  const playerStats = Object.values(scores).map(s => {
    const total = (typeof s.day1 === 'number' ? s.day1 : 0) + 
                  (typeof s.day2 === 'number' ? s.day2 : 0) + 
                  (typeof s.day3 === 'number' ? s.day3 : 0) + 
                  (typeof s.day4 === 'number' ? s.day4 : 0);
    const cutStatus = isPlayerCut(s);
    return { ...s, total, isCut: cutStatus };
  }).sort((a, b) => {
    if (a.isCut && !b.isCut) return 1;
    if (!a.isCut && b.isCut) return -1;
    return a.total - b.total;
  });

  const playerRankings = playerStats.map((p, index) => {
    const rankIndex = playerStats.findIndex(s => s.total === p.total && s.isCut === p.isCut);
    return { ...p, rank: p.isCut ? '-' : rankIndex + 1 };
  });

  const top10Players: typeof playerRankings = [];
  for (let i = 0; i < playerRankings.length; i++) {
    if (i < 10) {
      top10Players.push(playerRankings[i]);
    } else {
      const tenth = playerRankings[9];
      if (tenth && playerRankings[i].total === tenth.total && playerRankings[i].isCut === tenth.isCut) {
        top10Players.push(playerRankings[i]);
      } else {
        break;
      }
    }
  }

  const otherDraftedPlayers = playerRankings.filter(p => 
    draftedBy.has(p.playerName) && !top10Players.some(top => top.playerName === p.playerName)
  );
  // --- END NEW LOGIC ---

  if (connectionError) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#F4F8FA] gap-4 p-4">
        <div className="bg-white p-8 rounded-xl shadow-lg border-2 border-red-200 text-center max-w-md">
          <h2 className="text-xl font-bold text-red-600 mb-2">Data Unavailable</h2>
          <p className="text-sm text-gray-600">Unable to connect to the scoring database. Please check back later.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#E4E3E0]">
        <Loader2 className="w-8 h-8 animate-spin text-[#141414]" />
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-[#F4F8FA] text-[#001A2E] p-4 md:p-8 font-sans">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <header className="bg-[#00365F] text-white p-8 rounded-xl shadow-lg flex flex-col md:flex-row justify-between items-center gap-6 border-b-4 border-[#D4AF37]">
          <div className="flex items-center gap-6">
            <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center p-2 shadow-inner">
              <Trophy className="w-12 h-12 text-[#00365F]" />
            </div>
            <div>
              <h1 className="text-4xl md:text-6xl font-bold tracking-tighter uppercase font-serif">
                US Open 2026
              </h1>
              <p className="text-[#D4AF37] font-bold tracking-widest uppercase text-sm">Draft Dashboard</p>
            </div>
          </div>
          <div className="flex flex-col items-center md:items-end gap-4">
            <Countdown />
            <div className="text-center md:text-right bg-[#001A2E] p-3 rounded-lg border border-white/10 w-full">
              <p className="text-[10px] text-[#D4AF37] uppercase tracking-widest mb-1">Scoring Last Updated</p>
              <p className="text-xl font-mono font-bold">
                {lastUpdated ? lastUpdated.toLocaleTimeString() : 'Waiting...'}
              </p>
            </div>
          </div>
        </header>

        {/* Final Standings + Day Money (Conditional) */}
        {playoffComplete && (
          <section className="mb-12 space-y-6">
            <FinalStandings 
              participants={participants} 
              scores={scores} 
              cutline={cutline} 
              playoffScores={playoffScores} 
              prizes={PRIZES} 
            />

            {/* Day Money Winners — shown under Final Standings */}
            <div>
              <div className="flex items-center gap-3 mb-4">
                <DollarSign className="w-5 h-5 text-[#D4AF37]" />
                <h2 className="text-lg font-serif font-bold uppercase tracking-widest text-[#00365F]">Day Money Winners</h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {[1, 2, 3, 4].map(day => {
                  const winners = getDayMoneyWinners(day);
                  return (
                    <Card key={day} className="bg-white border-2 border-[#00365F]/10 rounded-xl shadow-sm overflow-hidden">
                      <CardHeader className="p-4 bg-[#00365F] text-white">
                        <CardTitle className="text-xs uppercase tracking-widest flex items-center justify-between">
                          Day {day} Money
                          <DollarSign className="w-3 h-3 text-[#D4AF37]" />
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="p-4">
                        {winners.length > 0 ? (
                          <div className="space-y-2">
                            {winners.map(w => (
                              <div key={w.id} className="flex justify-between items-center p-2 bg-[#F4F8FA] rounded border border-[#00365F]/5">
                                <span className="font-bold text-[#00365F]">{w.name}</span>
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-black text-emerald-600">${(75 / winners.length).toFixed(2)}</span>
                                  <Badge className="bg-[#D4AF37] text-[#001A2E] hover:bg-[#D4AF37]">
                                    {formatScore(w.dayBestScore)}
                                  </Badge>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs opacity-40 italic text-center py-2">Waiting for scores...</p>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          </section>
        )}

        {/* Main Leaderboard Table */}
        <LeaderboardTable
          allStats={allStats}
          scores={scores}
          isPlayerCut={isPlayerCut}
          formatScore={formatScore}
          playoffComplete={playoffComplete}
        />


        {/* Day Money Winners (shown below Final Standings when playoff is complete, hidden here) */}
        {!playoffComplete && (
          <section className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(day => {
              const winners = getDayMoneyWinners(day);
              return (
                <Card key={day} className="bg-white border-2 border-[#00365F]/10 rounded-xl shadow-sm overflow-hidden">
                  <CardHeader className="p-4 bg-[#00365F] text-white">
                    <CardTitle className="text-xs uppercase tracking-widest flex items-center justify-between">
                      Day {day} Money
                      <DollarSign className="w-3 h-3 text-[#D4AF37]" />
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-4">
                    {winners.length > 0 ? (
                      <div className="space-y-2">
                        {winners.map(w => (
                          <div key={w.id} className="flex justify-between items-center p-2 bg-[#F4F8FA] rounded border border-[#00365F]/5">
                            <span className="font-bold text-[#00365F]">{w.name}</span>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-black text-emerald-600">${(75 / winners.length).toFixed(2)}</span>
                              <Badge className="bg-[#D4AF37] text-[#001A2E] hover:bg-[#D4AF37]">
                                {formatScore(w.dayBestScore)}
                              </Badge>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs opacity-40 italic text-center py-2">Waiting for scores...</p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </section>
        )}

        {/* Player Scoreboard */}
        <PlayerScoreboard
          top10Players={top10Players}
          otherDraftedPlayers={otherDraftedPlayers}
          draftedBy={draftedBy}
          formatScore={formatScore}
          playoffComplete={playoffComplete}
        />

        {/* Prize Money Section */}
        <section className={`grid grid-cols-1 md:grid-cols-2 gap-6 ${playoffComplete ? 'opacity-50 grayscale transition-all duration-1000' : ''}`}>
          <Card className="bg-white border-2 border-[#00365F]/10 rounded-xl shadow-sm overflow-hidden">
            <CardHeader className="p-4 bg-[#00365F] text-white">
              <CardTitle className="text-sm uppercase tracking-widest flex items-center gap-2">
                <Wallet className="w-4 h-4 text-[#D4AF37]" />
                Tournament Prize Pool
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {PRIZES.map((p) => (
                  <div key={p.rank} className="text-center p-3 bg-[#F4F8FA] rounded-lg border border-[#00365F]/5">
                    <p className="text-[10px] uppercase text-[#00365F] font-bold mb-1">{p.rank}</p>
                    <p className="text-lg font-serif font-bold text-[#001A2E]">{p.amount}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white border-2 border-[#D4AF37]/30 rounded-xl shadow-sm overflow-hidden">
            <CardHeader className="p-4 bg-[#D4AF37] text-[#001A2E]">
              <CardTitle className="text-sm uppercase tracking-widest flex items-center gap-2">
                <DollarSign className="w-4 h-4" />
                Daily Bonus Pool
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {DAILY_BONUSES.map((b) => (
                  <div key={b.day} className="text-center p-3 bg-[#F4F8FA] rounded-lg border border-[#D4AF37]/10">
                    <p className="text-[10px] uppercase text-[#00365F] font-bold mb-1">{b.day}</p>
                    <p className="text-lg font-serif font-bold text-[#001A2E]">{b.amount}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Rules Footer */}
        <footer className="grid grid-cols-1 md:grid-cols-3 gap-8 pt-8 border-t border-[#141414] opacity-60">
          <div className="space-y-2">
            <h3 className="text-[10px] font-bold uppercase tracking-widest flex items-center gap-2">
              <Info className="w-3 h-3" />
              Scoring Logic
            </h3>
            <p className="text-xs leading-relaxed">
              Daily score is calculated as the sum of the lowest two players&apos; scores each day. 
              Total score is the cumulative sum of all four individual days.
            </p>
          </div>
          <div className="space-y-2">
            <h3 className="text-[10px] font-bold uppercase tracking-widest flex items-center gap-2">
              <DollarSign className="w-3 h-3" />
              Day Money
            </h3>
            <p className="text-xs leading-relaxed">
              Awarded to the participant with the lowest daily score ($75.00 per day). 
              In the event of a tie, the prize money is split equally among winners.
            </p>
          </div>
          <div className="space-y-2">
            <h3 className="text-[10px] font-bold uppercase tracking-widest flex items-center gap-2">
              <RefreshCw className="w-3 h-3" />
              Data Source
            </h3>
            <p className="text-xs leading-relaxed">
              Scores are fetched directly from ESPN live tournament data.
              Updates occur periodically throughout the tournament days.
            </p>
          </div>
        </footer>
      </div>
    </main>
  );
}
