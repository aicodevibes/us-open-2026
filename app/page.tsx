// app/page.tsx

import { adminDb } from '@/lib/firebase-admin';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Trophy, DollarSign, Info, RefreshCw, Wallet } from 'lucide-react';
import { FinalStandings } from '@/components/FinalStandings';
import { PRIZES, DAILY_BONUSES, TOURNAMENT_NAME, TOURNAMENT_SUBTITLE } from '@/lib/constants';
import { Countdown } from '@/components/Countdown';
import { LeaderboardTable } from '@/components/LeaderboardTable';
import { PlayerScoreboard } from '@/components/PlayerScoreboard';
import { RefreshTimer } from '@/components/RefreshTimer';
import { 
  isPlayerCut, 
  computeParticipantStandings, 
  getDayMoneyWinners 
} from '@/lib/scoring';
import { Participant, PlayerScore, PlayoffScore, PlayerRanking, TournamentEvent } from '@/types';
import { getActiveEventIdServer, ensureEventExistsServer } from '@/lib/events-server';

// Force dynamic rendering so server fetches live data on each request
export const dynamic = 'force-dynamic';

const formatScore = (score: number | null | undefined) => {
  if (score === 0) return 'E';
  if (score === null || score === undefined) return '-';
  return score > 0 ? `+${score}` : score.toString();
};

/**
 * Public Dashboard Component
 * Renders live golf draft standings on the server for the currently active event.
 */
export default async function Dashboard() {
  // 1. Determine active event ID and ensure it exists (running migration if necessary)
  const activeEventId = await getActiveEventIdServer();
  const eventData = await ensureEventExistsServer(activeEventId);

  const eventRef = adminDb.collection('theopen_events').doc(activeEventId);

  // Fetch live tournament records directly on the secure server (omitting duplicate eventRef.get())
  const [participantsSnap, scoresSnap] = await Promise.all([
    eventRef.collection('participants').get(),
    eventRef.collection('playerScores').get(),
  ]);

  const participants = participantsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Participant));
  
  const scores: Record<string, PlayerScore> = {};
  scoresSnap.docs.forEach(d => {
    const data = d.data() as PlayerScore;
    scores[data.playerName] = data;
  });

  const eventName = eventData?.name || TOURNAMENT_NAME;
  const eventSubtitle = eventData?.subtitle || TOURNAMENT_SUBTITLE;
  const cutline = eventData?.cutline ?? null;
  const playoffComplete = eventData?.playoffComplete ?? false;
  
  // Safe Date conversion for lastUpdated
  const lastUpdated = eventData?.lastUpdated
    ? (typeof eventData.lastUpdated.toDate === 'function' ? eventData.lastUpdated.toDate() : new Date(eventData.lastUpdated))
    : null;
    
  const startDate = eventData?.startDate || "";
  const endDate = eventData?.endDate || "";

  // Only query playoff scores when the playoff is completed
  let playoffScores: Record<string, PlayoffScore> = {};
  if (playoffComplete) {
    const playoffSnap = await eventRef.collection('playoffScores').get();
    playoffSnap.docs.forEach(d => {
      playoffScores[d.id] = d.data() as PlayoffScore;
    });
  }

  // 2. Pure business logic derivations
  const allStats = computeParticipantStandings(participants, scores, cutline, PRIZES);

  // Drafted map helper
  const draftedBy = new Map<string, string>();
  participants.forEach(p => {
    p.players.forEach(player => {
      draftedBy.set(player, p.name);
    });
  });

  // Calculate overall player ranking lists
  const playerStats = Object.values(scores).map(s => {
    const total = (typeof s.day1 === 'number' ? s.day1 : 0) + 
                  (typeof s.day2 === 'number' ? s.day2 : 0) + 
                  (typeof s.day3 === 'number' ? s.day3 : 0) + 
                  (typeof s.day4 === 'number' ? s.day4 : 0);
    const cutStatus = isPlayerCut(s, cutline);
    return { ...s, total, isCut: cutStatus };
  }).sort((a, b) => {
    if (a.isCut && !b.isCut) return 1;
    if (!a.isCut && b.isCut) return -1;
    return a.total - b.total;
  });

  const playerRankings = playerStats.map((p, index) => {
    const rankIndex = playerStats.findIndex(s => s.total === p.total && s.isCut === p.isCut);
    return { ...p, rank: p.isCut ? '-' : rankIndex + 1 } as PlayerRanking;
  });

  const top10Players: PlayerRanking[] = [];
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

  return (
    <main className="min-h-screen bg-[#f8f9fa] text-[#05041a] p-4 md:p-8 font-sans">
      {/* Poll and refresh server components every 60 seconds */}
      <RefreshTimer intervalMs={60000} />

      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <header className="bg-[#06051e] text-white p-8 rounded-xl shadow-lg flex flex-col md:flex-row justify-between items-center gap-6 border-b-4 border-[#ffba00]">
          <div className="flex items-center gap-6">
            <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center p-2 shadow-inner">
              <Trophy className="w-12 h-12 text-[#06051e]" />
            </div>
            <div>
              <h1 className="text-4xl md:text-6xl font-bold tracking-tighter uppercase font-serif">
                {eventName}
              </h1>
              <p className="text-[#ffba00] font-bold tracking-widest uppercase text-sm">{eventSubtitle}</p>
            </div>
          </div>
          <div className="flex flex-col items-center md:items-end gap-4">
            <Countdown startDate={startDate} endDate={endDate} />
            <div className="text-center md:text-right bg-[#05041a] p-3 rounded-lg border border-white/10 w-full">
              <p className="text-[10px] text-[#ffba00] uppercase tracking-widest mb-1">Scoring Last Updated</p>
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
                <DollarSign className="w-5 h-5 text-[#ffba00]" />
                <h2 className="text-lg font-serif font-bold uppercase tracking-widest text-[#06051e]">Day Money Winners</h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {[1, 2, 3, 4].map(day => {
                  const winners = getDayMoneyWinners(participants, scores, day, cutline, allStats);
                  return (
                    <Card key={day} className="bg-white border-2 border-[#06051e]/10 rounded-xl shadow-sm overflow-hidden">
                      <CardHeader className="p-4 bg-[#06051e] text-white">
                        <CardTitle className="text-xs uppercase tracking-widest flex items-center justify-between">
                          Day {day} Money
                          <DollarSign className="w-3 h-3 text-[#ffba00]" />
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="p-4">
                        {winners.length > 0 ? (
                          <div className="space-y-2">
                            {winners.map(w => (
                              <div key={w.id} className="flex justify-between items-center p-2 bg-[#f8f9fa] rounded border border-[#06051e]/5">
                                <span className="font-bold text-[#06051e]">{w.name}</span>
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-black text-emerald-600">${(75 / winners.length).toFixed(2)}</span>
                                  <Badge className="bg-[#ffba00] text-[#05041a] hover:bg-[#ffba00]">
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
          isPlayerCut={(p) => isPlayerCut(p, cutline)}
          formatScore={formatScore}
          playoffComplete={playoffComplete}
        />

        {/* Day Money Winners (shown below Final Standings when playoff is complete, hidden here) */}
        {!playoffComplete && (
          <section className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(day => {
              const winners = getDayMoneyWinners(participants, scores, day, cutline, allStats);
              return (
                <Card key={day} className="bg-white border-2 border-[#06051e]/10 rounded-xl shadow-sm overflow-hidden">
                  <CardHeader className="p-4 bg-[#06051e] text-white">
                    <CardTitle className="text-xs uppercase tracking-widest flex items-center justify-between">
                      Day {day} Money
                      <DollarSign className="w-3 h-3 text-[#ffba00]" />
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-4">
                    {winners.length > 0 ? (
                      <div className="space-y-2">
                        {winners.map(w => (
                          <div key={w.id} className="flex justify-between items-center p-2 bg-[#f8f9fa] rounded border border-[#06051e]/5">
                            <span className="font-bold text-[#06051e]">{w.name}</span>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-black text-emerald-600">${(75 / winners.length).toFixed(2)}</span>
                              <Badge className="bg-[#ffba00] text-[#05041a] hover:bg-[#ffba00]">
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
          <Card className="bg-white border-2 border-[#06051e]/10 rounded-xl shadow-sm overflow-hidden">
            <CardHeader className="p-4 bg-[#06051e] text-white">
              <CardTitle className="text-sm uppercase tracking-widest flex items-center gap-2">
                <Wallet className="w-4 h-4 text-[#ffba00]" />
                Tournament Prize Pool
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {PRIZES.map((p) => (
                  <div key={p.rank} className="text-center p-3 bg-[#f8f9fa] rounded-lg border border-[#06051e]/5">
                    <p className="text-[10px] uppercase text-[#06051e] font-bold mb-1">{p.rank}</p>
                    <p className="text-lg font-serif font-bold text-[#05041a]">{p.amount}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white border-2 border-[#ffba00]/30 rounded-xl shadow-sm overflow-hidden">
            <CardHeader className="p-4 bg-[#ffba00] text-[#05041a]">
              <CardTitle className="text-sm uppercase tracking-widest flex items-center gap-2">
                <DollarSign className="w-4 h-4" />
                Daily Bonus Pool
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {DAILY_BONUSES.map((b) => (
                  <div key={b.day} className="text-center p-3 bg-[#f8f9fa] rounded-lg border border-[#ffba00]/10">
                    <p className="text-[10px] uppercase text-[#06051e] font-bold mb-1">{b.day}</p>
                    <p className="text-lg font-serif font-bold text-[#05041a]">{b.amount}</p>
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
