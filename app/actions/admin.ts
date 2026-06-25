// app/actions/admin.ts
'use server';

import { adminDb, adminAuth } from '@/lib/firebase-admin';
import { getAuthorizedEmails } from '@/lib/constants';
import { INITIAL_PARTICIPANTS, INITIAL_GREEDY_PARTICIPANTS } from '@/lib/initialData';

import { syncEspnScores, fetchRound4HolesForPlayers, fetchUpcomingEspnEvents } from '@/lib/espn';
import { getActiveEventIdServer, ensureEventExistsServer } from '@/lib/events-server';
import { FieldValue } from 'firebase-admin/firestore';
import { revalidatePath } from 'next/cache';
import { Participant, PlayerScore, TournamentEvent } from '@/types';
import { isPlayerCut, calculateDailyScore } from '@/lib/scoring';

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

export async function createEventAction(
  idToken: string,
  name: string,
  espnEventId: string,
  subtitle: string,
  startDate: string,
  endDate: string,
  makeActive: boolean
) {
  await verifyAdmin(idToken);

  if (!name.trim()) throw new Error('Event name is required');
  if (!espnEventId.trim()) throw new Error('ESPN Event ID is required');

  const eventRef = adminDb.collection('golf_events').doc();
  const eventId = eventRef.id;

  const eventData = {
    name: name.trim(),
    subtitle: subtitle.trim() || 'Draft Dashboard',
    espnEventId: espnEventId.trim(),
    startDate: startDate || new Date().toISOString(),
    endDate: endDate || new Date().toISOString(),
    cutline: null,
    playoffComplete: false,
    lastUpdated: FieldValue.serverTimestamp()
  };

  await eventRef.set(eventData);

  if (makeActive) {
    await adminDb.collection('golf_config').doc('activeEvent').set({
      activeEventId: eventId
    }, { merge: true });
  }

  revalidatePath('/');
  revalidatePath('/greedy');
  return { success: true, eventId };
}

export async function updateEventAction(
  idToken: string,
  eventId: string,
  name: string,
  espnEventId: string,
  subtitle: string,
  startDate: string,
  endDate: string,
  makeActive: boolean
) {
  await verifyAdmin(idToken);

  if (!eventId) throw new Error('Event ID is required');
  if (!name.trim()) throw new Error('Event name is required');
  if (!espnEventId.trim()) throw new Error('ESPN Event ID is required');

  const eventRef = adminDb.collection('golf_events').doc(eventId);
  await eventRef.update({
    name: name.trim(),
    subtitle: subtitle.trim(),
    espnEventId: espnEventId.trim(),
    startDate: startDate,
    endDate: endDate,
    lastUpdated: FieldValue.serverTimestamp()
  });

  if (makeActive) {
    await adminDb.collection('golf_config').doc('activeEvent').set({
      activeEventId: eventId
    }, { merge: true });
  }

  revalidatePath('/');
  revalidatePath('/greedy');
  return { success: true };
}

export async function deleteEventAction(idToken: string, eventId: string) {
  await verifyAdmin(idToken);

  if (!eventId) throw new Error('Event ID is required');

  const eventRef = adminDb.collection('golf_events').doc(eventId);
  const batch = adminDb.batch();

  // Cascade delete subcollections
  const subcollections = ['participants', 'playerScores', 'greedyParticipants', 'playoffScores'];
  for (const subName of subcollections) {
    const snap = await eventRef.collection(subName).get();
    snap.docs.forEach(doc => batch.delete(doc.ref));
  }

  batch.delete(eventRef);
  await batch.commit();

  // Reset active event config if active event was deleted
  const activeDoc = await adminDb.collection('golf_config').doc('activeEvent').get();
  if (activeDoc.exists && activeDoc.data()?.activeEventId === eventId) {
    await adminDb.collection('golf_config').doc('activeEvent').set({
      activeEventId: ''
    }, { merge: true });
  }

  revalidatePath('/');
  revalidatePath('/greedy');
  return { success: true };
}

export async function setActiveEventAction(idToken: string, eventId: string) {
  await verifyAdmin(idToken);

  if (!eventId) throw new Error('Event ID is required');

  await adminDb.collection('golf_config').doc('activeEvent').set({
    activeEventId: eventId
  }, { merge: true });

  revalidatePath('/');
  revalidatePath('/greedy');
  return { success: true };
}

export async function getUpcomingEspnEventsAction(idToken: string) {
  await verifyAdmin(idToken);
  return await fetchUpcomingEspnEvents();
}

export async function seedParticipantsAction(idToken: string, eventId: string) {
  await verifyAdmin(idToken);
  await ensureEventExistsServer(eventId);

  const eventRef = adminDb.collection('golf_events').doc(eventId);
  const batch = adminDb.batch();

  // 1. Clear existing participants in this event
  const existingParticipants = await eventRef.collection('participants').get();
  existingParticipants.forEach(doc => batch.delete(doc.ref));

  // 2. Add New Participants
  INITIAL_PARTICIPANTS.forEach((p) => {
    const docRef = eventRef.collection('participants').doc();
    batch.set(docRef, p);
  });

  // 3. Initialize Player Scores
  const allPlayers = Array.from(new Set(INITIAL_PARTICIPANTS.flatMap(p => p.players)));
  allPlayers.forEach((playerName) => {
    const playerRef = eventRef.collection('playerScores').doc(playerName);
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

export async function seedGreedyParticipantsAction(idToken: string, eventId: string) {
  await verifyAdmin(idToken);
  await ensureEventExistsServer(eventId);

  const eventRef = adminDb.collection('golf_events').doc(eventId);
  const batch = adminDb.batch();

  // 1. Clear existing greedy participants in this event
  const existingGreedy = await eventRef.collection('greedyParticipants').get();
  existingGreedy.forEach(doc => batch.delete(doc.ref));

  // 2. Add New Greedy Participants
  INITIAL_GREEDY_PARTICIPANTS.forEach((p) => {
    const docRef = eventRef.collection('greedyParticipants').doc();
    batch.set(docRef, p);
  });

  await batch.commit();
  revalidatePath('/greedy');
  return { success: true, count: INITIAL_GREEDY_PARTICIPANTS.length };
}

export async function clearAllDataAction(idToken: string, eventId: string) {
  await verifyAdmin(idToken);
  await ensureEventExistsServer(eventId);

  const eventRef = adminDb.collection('golf_events').doc(eventId);
  const batch = adminDb.batch();
  
  const subcollections = [
    'participants',
    'playerScores',
    'greedyParticipants',
    'playoffScores'
  ];

  for (const colName of subcollections) {
    const snap = await eventRef.collection(colName).get();
    snap.docs.forEach(doc => batch.delete(doc.ref));
  }

  // Reset the config settings on the event document
  batch.update(eventRef, {
    cutline: null,
    playoffComplete: false,
    lastUpdated: FieldValue.serverTimestamp()
  });

  await batch.commit();
  revalidatePath('/');
  revalidatePath('/greedy');
  return { success: true };
}

export async function syncScoresAction(idToken: string, eventId: string) {
  await verifyAdmin(idToken);
  const result = await syncEspnScores(eventId);
  revalidatePath('/');
  revalidatePath('/greedy');
  return result;
}

export async function addParticipantAction(idToken: string, eventId: string, name: string, players: string[]) {
  await verifyAdmin(idToken);
  await ensureEventExistsServer(eventId);

  if (!name.trim()) throw new Error('Participant name is required');
  if (!players || players.length === 0) throw new Error('Please enter at least one golfer');

  const eventRef = adminDb.collection('golf_events').doc(eventId);
  const ref = eventRef.collection('participants').doc();
  await ref.set({
    name: name.trim(),
    players: players
  });

  revalidatePath('/');
  return { success: true };
}

export async function deleteParticipantAction(idToken: string, eventId: string, id: string) {
  await verifyAdmin(idToken);
  const eventRef = adminDb.collection('golf_events').doc(eventId);
  await eventRef.collection('participants').doc(id).delete();
  revalidatePath('/');
  return { success: true };
}

export async function updateParticipantPlayersAction(idToken: string, eventId: string, id: string, players: string[]) {
  await verifyAdmin(idToken);
  const eventRef = adminDb.collection('golf_events').doc(eventId);
  await eventRef.collection('participants').doc(id).update({
    players: players
  });
  revalidatePath('/');
  return { success: true };
}

export async function updateCutlineAction(idToken: string, eventId: string, cutline: number | null) {
  await verifyAdmin(idToken);
  const eventRef = adminDb.collection('golf_events').doc(eventId);
  await eventRef.update({
    cutline: cutline
  });
  revalidatePath('/');
  return { success: true };
}

export async function finalizePlayoffAction(idToken: string, eventId: string) {
  await verifyAdmin(idToken);
  await ensureEventExistsServer(eventId);

  const eventRef = adminDb.collection('golf_events').doc(eventId);

  const [participantsSnap, scoresSnap, eventSnap] = await Promise.all([
    eventRef.collection('participants').get(),
    eventRef.collection('playerScores').get(),
    eventRef.get(),
  ]);

  const eventData = eventSnap.data();
  const cutline = eventData?.cutline ?? null;
  
  const participants = participantsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Participant[];
  const scores: Record<string, PlayerScore> = {};
  scoresSnap.docs.forEach(doc => {
    const data = doc.data() as PlayerScore;
    scores[data.playerName] = data;
  });

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

  const ranked = stats
    .filter(s => !s.isCut)
    .sort((a, b) => a.total - b.total);

  const top4Scores = ranked.slice(0, 4).map(r => r.total);
  const tiedScores = top4Scores.filter((score, index, arr) => arr.indexOf(score) !== index);
  const uniqueTiedScores = Array.from(new Set(tiedScores));

  let tiedParticipants: typeof ranked = [];
  if (uniqueTiedScores.length > 0) {
    tiedParticipants = ranked.filter(r => uniqueTiedScores.includes(r.total));
  }

  const playersToFetch = new Set<string>();
  
  tiedParticipants.forEach(p => {
      const participantObj = p.participant;
      const playerStats = participantObj.players.map((name: string) => {
          const scoreData = scores[name];
          if (!scoreData || isPlayerCut(scoreData, cutline)) return { name, score: 999 };
          if (typeof scoreData.day4 !== 'number') return { name, score: 999 };
          return { name, score: scoreData.day4 };
      });

      playerStats.sort((a, b) => a.score - b.score);
      
      if (playerStats[0] && playerStats[0].score !== 999) playersToFetch.add(playerStats[0].name);
      if (playerStats[1] && playerStats[1].score !== 999) playersToFetch.add(playerStats[1].name);
  });

  const playerNamesArray = Array.from(playersToFetch);

  if (playerNamesArray.length > 0) {
      const playoffData = await fetchRound4HolesForPlayers(playerNamesArray, eventId);
      
      const batch = adminDb.batch();
      const playoffCollection = eventRef.collection('playoffScores');

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

  await eventRef.update({
      playoffComplete: true,
      lastUpdated: new Date()
  });

  revalidatePath('/');
  return { success: true, fetchedPlayers: playerNamesArray };
}

export async function syncParticipantNamesAction(idToken: string, eventId: string) {
  await verifyAdmin(idToken);
  await ensureEventExistsServer(eventId);

  const eventRef = adminDb.collection('golf_events').doc(eventId);
  const batch = adminDb.batch();
  const pSnap = await eventRef.collection('participants').get();
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
