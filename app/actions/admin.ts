// app/actions/admin.ts
'use server';

import { adminDb, adminAuth } from '@/lib/firebase-admin';
import { getAuthorizedEmails } from '@/lib/constants';
import { INITIAL_PARTICIPANTS, INITIAL_GREEDY_PARTICIPANTS } from '@/lib/initialData';
import { syncEspnScores, fetchRound4HolesForPlayers } from '@/lib/espn';
import { FieldValue } from 'firebase-admin/firestore';
import { revalidatePath } from 'next/cache';

/**
 * Authenticates user and checks whitelisted admin emails.
 */
async function verifyAdmin(idToken: string) {
  if (!idToken) {
    throw new Error('Unauthorized: No authentication token provided');
  }
  const decodedToken = await adminAuth.verifyIdToken(idToken);
  const email = decodedToken.email?.toLowerCase().trim();
  const authorizedEmails = getAuthorizedEmails();
  
  if (!email || !authorizedEmails.includes(email)) {
    throw new Error(`Unauthorized: User ${email || 'unknown'} is not an admin`);
  }
  return decodedToken;
}

export async function seedParticipantsAction(idToken: string) {
  await verifyAdmin(idToken);

  const batch = adminDb.batch();

  // 1. Clear existing participants
  const existingParticipants = await adminDb.collection('usopen_participants').get();
  existingParticipants.forEach(doc => batch.delete(doc.ref));

  // 2. Add New Participants
  INITIAL_PARTICIPANTS.forEach((p) => {
    const docRef = adminDb.collection('usopen_participants').doc();
    batch.set(docRef, p);
  });

  // 3. Initialize Player Scores
  const allPlayers = Array.from(new Set(INITIAL_PARTICIPANTS.flatMap(p => p.players)));
  allPlayers.forEach((playerName) => {
    const playerRef = adminDb.collection('usopen_playerScores').doc(playerName);
    batch.set(playerRef, {
      playerName,
      day1: 0,
      day2: 0,
      day3: 0,
      day4: 0,
      isCut: false
    }, { merge: true });
  });

  await batch.commit();
  revalidatePath('/');
  return { success: true, count: INITIAL_PARTICIPANTS.length };
}

export async function seedGreedyParticipantsAction(idToken: string) {
  await verifyAdmin(idToken);

  const batch = adminDb.batch();

  // 1. Clear existing greedy participants
  const existingGreedy = await adminDb.collection('usopen_greedyParticipants').get();
  existingGreedy.forEach(doc => batch.delete(doc.ref));

  // 2. Add New Greedy Participants
  INITIAL_GREEDY_PARTICIPANTS.forEach((p) => {
    const docRef = adminDb.collection('usopen_greedyParticipants').doc();
    batch.set(docRef, p);
  });

  await batch.commit();
  revalidatePath('/greedy');
  return { success: true, count: INITIAL_GREEDY_PARTICIPANTS.length };
}

export async function clearAllDataAction(idToken: string) {
  await verifyAdmin(idToken);

  const batch = adminDb.batch();
  const collections = [
    'usopen_participants',
    'usopen_playerScores',
    'usopen_config',
    'usopen_greedyParticipants',
    'usopen_playoffScores'
  ];

  for (const colName of collections) {
    const snap = await adminDb.collection(colName).get();
    snap.docs.forEach(doc => batch.delete(doc.ref));
  }

  await batch.commit();
  revalidatePath('/');
  revalidatePath('/greedy');
  return { success: true };
}

export async function syncScoresAction(idToken: string) {
  await verifyAdmin(idToken);
  const result = await syncEspnScores();
  revalidatePath('/');
  revalidatePath('/greedy');
  return result;
}

export async function addParticipantAction(idToken: string, name: string, players: string[]) {
  await verifyAdmin(idToken);

  if (!name.trim()) throw new Error('Participant name is required');
  if (!players || players.length === 0) throw new Error('Please enter at least one golfer');

  const ref = adminDb.collection('usopen_participants').doc();
  await ref.set({
    name: name.trim(),
    players: players
  });

  revalidatePath('/');
  return { success: true };
}

export async function deleteParticipantAction(idToken: string, id: string) {
  await verifyAdmin(idToken);
  await adminDb.collection('usopen_participants').doc(id).delete();
  revalidatePath('/');
  return { success: true };
}

export async function updateParticipantPlayersAction(idToken: string, id: string, players: string[]) {
  await verifyAdmin(idToken);
  await adminDb.collection('usopen_participants').doc(id).update({
    players: players
  });
  revalidatePath('/');
  return { success: true };
}

export async function updateCutlineAction(idToken: string, cutline: number | null) {
  await verifyAdmin(idToken);
  await adminDb.collection('usopen_config').doc('tournament').set({
    cutline: cutline
  }, { merge: true });
  revalidatePath('/');
  return { success: true };
}

export async function finalizePlayoffAction(idToken: string) {
  await verifyAdmin(idToken);

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

  const isPlayerCutLocal = (scoreData: any) => {
    if (!scoreData) return true;
    if (cutline !== null && typeof scoreData.day1 === 'number' && typeof scoreData.day2 === 'number') {
      return (scoreData.day1 + scoreData.day2) > cutline;
    }
    return !!scoreData.isCut;
  };

  const calculateDailyScoreLocal = (participant: any, day: number) => {
    const dayKey = `day${day}`;
    const playerScores = participant.players.map((p: string, index: number) => {
      const scoreData = scores[p];
      if (!scoreData) return (day === 3 || day === 4) ? 999 : 0;
      if (index >= 3 && (day === 1 || day === 2)) return 999;
      if ((day === 3 || day === 4) && isPlayerCutLocal(scoreData)) return 999;
      
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

  const stats = participants.map(p => {
    const d1 = calculateDailyScoreLocal(p, 1);
    const d2 = calculateDailyScoreLocal(p, 2);
    const d3 = calculateDailyScoreLocal(p, 3);
    const d4 = calculateDailyScoreLocal(p, 4);
    const activePlayersDay3 = p.players.filter((name: string) => !isPlayerCutLocal(scores[name])).length;
    return {
      participant: p,
      total: d1 + d2 + d3 + d4,
      isCut: activePlayersDay3 === 0
    };
  });

  const ranked = stats
    .filter(s => !s.isCut)
    .sort((a, b) => a.total - b.total);

  const top4Scores = ranked.slice(0, 4).map(r => r.total);
  const tiedScores = top4Scores.filter((score, index, arr) => arr.indexOf(score) !== index);
  const uniqueTiedScores = Array.from(new Set(tiedScores));

  let tiedParticipants: any[] = [];
  if (uniqueTiedScores.length > 0) {
    tiedParticipants = ranked.filter(r => uniqueTiedScores.includes(r.total));
  }

  const playersToFetch = new Set<string>();
  
  tiedParticipants.forEach(p => {
      const participantObj = p.participant;
      const playerStats = participantObj.players.map((name: string) => {
          const scoreData = scores[name];
          if (!scoreData || isPlayerCutLocal(scoreData)) return { name, score: 999 };
          if (typeof scoreData.day4 !== 'number') return { name, score: 999 };
          return { name, score: scoreData.day4 };
      });

      playerStats.sort((a: any, b: any) => a.score - b.score);
      
      if (playerStats[0] && playerStats[0].score !== 999) playersToFetch.add(playerStats[0].name);
      if (playerStats[1] && playerStats[1].score !== 999) playersToFetch.add(playerStats[1].name);
  });

  const playerNamesArray = Array.from(playersToFetch);

  if (playerNamesArray.length > 0) {
      const playoffData = await fetchRound4HolesForPlayers(playerNamesArray);
      
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

  await adminDb.collection('usopen_config').doc('tournament').update({
      playoffComplete: true,
      lastUpdated: new Date()
  });

  revalidatePath('/');
  return { success: true, fetchedPlayers: playerNamesArray };
}

export async function syncParticipantNamesAction(idToken: string) {
  await verifyAdmin(idToken);
  
  const batch = adminDb.batch();
  const pSnap = await adminDb.collection('usopen_participants').get();
  let count = 0;
  
  pSnap.docs.forEach((docSnap) => {
    const currentData = docSnap.data();
    const matchingInitial = INITIAL_PARTICIPANTS.find(p => p.name === currentData.name);
    if (matchingInitial) {
      batch.update(docSnap.ref, { players: matchingInitial.players });
      count++;
    }
  });
  
  await batch.commit();
  revalidatePath('/');
  return { success: true, count };
}
