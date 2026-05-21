import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { fetchRound4HolesForPlayers } from '@/lib/espn';

export const dynamic = 'force-dynamic'; // Ensure this route is never cached

export async function POST() {
  try {
    // 1. Fetch participants and playerScores
    const [participantsSnap, scoresSnap, configSnap] = await Promise.all([
      adminDb.collection('usopen_participants').get(),
      adminDb.collection('usopen_playerScores').get(),
      adminDb.collection('usopen_config').doc('tournament').get(),
    ]);

    const cutline = configSnap.data()?.cutline ?? null;
    
    const participants = participantsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as any[];
    const scores: Record<string, any> = {};
    scoresSnap.docs.forEach(doc => {
      const data = doc.data();
      scores[data.playerName] = data;
    });

    // 2. Re-implement score calculation logic
    const isPlayerCut = (scoreData: any) => {
      if (!scoreData) return true;
      if (cutline !== null && typeof scoreData.day1 === 'number' && typeof scoreData.day2 === 'number') {
        return (scoreData.day1 + scoreData.day2) > cutline;
      }
      return !!scoreData.isCut;
    };

    const calculateDailyScore = (participant: any, day: number) => {
      const dayKey = `day${day}`;
      const playerScores = participant.players.map((p: string, index: number) => {
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

    // 3. Compute totals and rank
    const stats = participants.map(p => {
      const d1 = calculateDailyScore(p, 1);
      const d2 = calculateDailyScore(p, 2);
      const d3 = calculateDailyScore(p, 3);
      const d4 = calculateDailyScore(p, 4);
      const activePlayersDay3 = p.players.filter((name: string) => !isPlayerCut(scores[name])).length;
      return {
        participant: p,
        total: d1 + d2 + d3 + d4,
        isCut: activePlayersDay3 === 0
      };
    });

    // Sort by total ascending
    const ranked = stats
      .filter(s => !s.isCut)
      .sort((a, b) => a.total - b.total);

    // 4. Identify ties in the Top 4
    // We only care about ties that affect positions 1, 2, 3, or 4.
    const top4Scores = ranked.slice(0, 4).map(r => r.total);
    const tiedScores = top4Scores.filter((score, index, arr) => arr.indexOf(score) !== index);
    
    // Get unique tied scores
    const uniqueTiedScores = Array.from(new Set(tiedScores));

    let tiedParticipants: any[] = [];
    if (uniqueTiedScores.length > 0) {
      tiedParticipants = ranked.filter(r => uniqueTiedScores.includes(r.total));
    }

    // 5. Gather players to fetch from ESPN
    const playersToFetch = new Set<string>();
    
    // For each tied participant, we need their top 2 day 4 players
    tiedParticipants.forEach(p => {
        const participantObj = p.participant;
        // get all day4 scores for this participant's players
        const playerStats = participantObj.players.map((name: string, index: number) => {
            const scoreData = scores[name];
            // Must not be cut
            if (!scoreData || isPlayerCut(scoreData)) return { name, score: 999 };
            // Must have day 4 score
            if (typeof scoreData.day4 !== 'number') return { name, score: 999 };
            return { name, score: scoreData.day4 };
        });

        // sort to find the two best day4 players
        playerStats.sort((a: any, b: any) => a.score - b.score);
        
        if (playerStats[0] && playerStats[0].score !== 999) playersToFetch.add(playerStats[0].name);
        if (playerStats[1] && playerStats[1].score !== 999) playersToFetch.add(playerStats[1].name);
    });

    const playerNamesArray = Array.from(playersToFetch);

    // 6. Fetch from ESPN (if there are tied players)
    if (playerNamesArray.length > 0) {
        console.log("Fetching playoff data for:", playerNamesArray);
        const playoffData = await fetchRound4HolesForPlayers(playerNamesArray);
        
        // 7. Write to playoffScores collection
        const batch = adminDb.batch();
        const playoffCollection = adminDb.collection('usopen_playoffScores');

        // Optional: clear existing playoffScores first to ensure clean state
        const existingDocs = await playoffCollection.get();
        existingDocs.docs.forEach(doc => {
            batch.delete(doc.ref);
        });

        Object.entries(playoffData).forEach(([playerName, holes]) => {
            const docRef = playoffCollection.doc(playerName);
            batch.set(docRef, {
                playerName,
                round4Holes: holes,
                updatedAt: new Date()
            });
        });

        await batch.commit();
    }

    // 8. Update tournament config to trigger frontend FinalStandings
    await adminDb.collection('usopen_config').doc('tournament').update({
        playoffComplete: true,
        lastUpdated: new Date()
    });

    return NextResponse.json({ 
        success: true, 
        message: "Playoff calculation complete",
        fetchedPlayers: playerNamesArray 
    });

  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;
    console.error("Error finalizing standings:", error);
    return NextResponse.json({ error: "Failed to finalize standings", detail: message, stack }, { status: 500 });
  }
}
