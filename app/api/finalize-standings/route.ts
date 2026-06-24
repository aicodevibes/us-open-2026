import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { fetchRound4HolesForPlayers } from '@/lib/espn';
import { isPlayerCut, calculateDailyScore } from '@/lib/scoring';
import { PlayerScore, Participant } from '@/types';

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
    
    const participants = participantsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Participant[];
    const scores: Record<string, PlayerScore> = {};
    scoresSnap.docs.forEach(doc => {
      const data = doc.data() as PlayerScore;
      scores[data.playerName] = data;
    });

    // 2. Compute totals and rank
    const stats = participants.map(p => {
      const d1 = calculateDailyScore(p, 1, scores, cutline);
      const d2 = calculateDailyScore(p, 2, scores, cutline);
      const d3 = calculateDailyScore(p, 3, scores, cutline);
      const d4 = calculateDailyScore(p, 4, scores, cutline);
      const activePlayersDay3 = p.players.filter((name: string) => !isPlayerCut(scores[name], cutline)).length;
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

    // 3. Identify ties in the Top 4
    const top4Scores = ranked.slice(0, 4).map(r => r.total);
    const tiedScores = top4Scores.filter((score, index, arr) => arr.indexOf(score) !== index);
    const uniqueTiedScores = Array.from(new Set(tiedScores));

    let tiedParticipants: any[] = [];
    if (uniqueTiedScores.length > 0) {
      tiedParticipants = ranked.filter(r => uniqueTiedScores.includes(r.total));
    }

    // 4. Gather players to fetch from ESPN
    const playersToFetch = new Set<string>();
    
    tiedParticipants.forEach(p => {
        const participantObj = p.participant;
        const playerStats = participantObj.players.map((name: string) => {
            const scoreData = scores[name];
            if (!scoreData || isPlayerCut(scoreData, cutline)) return { name, score: 999 };
            if (typeof scoreData.day4 !== 'number') return { name, score: 999 };
            return { name, score: scoreData.day4 };
        });

        playerStats.sort((a: any, b: any) => a.score - b.score);
        
        if (playerStats[0] && playerStats[0].score !== 999) playersToFetch.add(playerStats[0].name);
        if (playerStats[1] && playerStats[1].score !== 999) playersToFetch.add(playerStats[1].name);
    });

    const playerNamesArray = Array.from(playersToFetch);

    // 5. Fetch from ESPN (if there are tied players)
    if (playerNamesArray.length > 0) {
        console.log("Fetching playoff data for:", playerNamesArray);
        const playoffData = await fetchRound4HolesForPlayers(playerNamesArray);
        
        // 6. Write to playoffScores collection
        const batch = adminDb.batch();
        const playoffCollection = adminDb.collection('usopen_playoffScores');

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

    // 7. Update tournament config to trigger frontend FinalStandings
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
