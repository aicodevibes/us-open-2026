// lib/events-server.ts

import { adminDb } from './firebase-admin';
import { TournamentEvent } from '@/types';
import { TOURNAMENT_NAME, TOURNAMENT_START_DATE, TOURNAMENT_END_DATE, ESPN_EVENT_ID } from './constants';
import { FieldValue } from 'firebase-admin/firestore';

/**
 * SERVER SIDE: Retrieve the active event ID.
 */
export async function getActiveEventIdServer(): Promise<string> {
  try {
    const activeDoc = await adminDb.collection('golf_config').doc('activeEvent').get();
    if (activeDoc.exists) {
      const data = activeDoc.data();
      if (data?.activeEventId) {
        return data.activeEventId;
      }
    }
  } catch (e) {
    console.error('Error fetching active event ID server side:', e);
  }
  return ESPN_EVENT_ID; // Fallback to "401811952"
}

/**
 * SERVER SIDE: Ensures the event document exists in `golf_events`.
 * If it is the default tournament (401811952) and doesn't exist,
 * it runs the automatic migration of legacy root collections into this event's subcollections.
 */
export async function ensureEventExistsServer(eventId: string): Promise<TournamentEvent> {
  const eventRef = adminDb.collection('golf_events').doc(eventId);
  const eventSnap = await eventRef.get();

  if (eventSnap.exists) {
    const data = eventSnap.data() as Omit<TournamentEvent, 'id'>;
    return { id: eventId, ...data };
  }

  // If this is the default tournament, perform the data migration
  if (eventId === ESPN_EVENT_ID) {
    console.log(`Default event ${eventId} does not exist in 'golf_events'. Migrating legacy data...`);

    // Get legacy config if it exists
    let legacyConfig: any = null;
    try {
      const legacyConfigSnap = await adminDb.collection('usopen_config').doc('tournament').get();
      if (legacyConfigSnap.exists) {
        legacyConfig = legacyConfigSnap.data();
      }
    } catch (e) {
      console.warn('Could not read legacy config:', e);
    }

    const newEvent: Omit<TournamentEvent, 'id'> = {
      name: TOURNAMENT_NAME,
      subtitle: "Draft Dashboard",
      espnEventId: ESPN_EVENT_ID,
      startDate: TOURNAMENT_START_DATE,
      endDate: TOURNAMENT_END_DATE,
      cutline: legacyConfig?.cutline ?? null,
      playoffComplete: legacyConfig?.playoffComplete ?? false,
      lastUpdated: legacyConfig?.lastUpdated ?? FieldValue.serverTimestamp()
    };

    const batch = adminDb.batch();
    batch.set(eventRef, newEvent);

    // Save active event configuration
    batch.set(adminDb.collection('golf_config').doc('activeEvent'), { activeEventId: eventId }, { merge: true });

    // Migrate participants
    try {
      const snap = await adminDb.collection('usopen_participants').get();
      snap.docs.forEach((docSnap) => {
        const targetRef = eventRef.collection('participants').doc(docSnap.id);
        batch.set(targetRef, docSnap.data());
      });
    } catch (e) {
      console.warn('Could not migrate participants:', e);
    }

    // Migrate greedy participants
    try {
      const snap = await adminDb.collection('usopen_greedyParticipants').get();
      snap.docs.forEach((docSnap) => {
        const targetRef = eventRef.collection('greedyParticipants').doc(docSnap.id);
        batch.set(targetRef, docSnap.data());
      });
    } catch (e) {
      console.warn('Could not migrate greedy participants:', e);
    }

    // Migrate player scores
    try {
      const snap = await adminDb.collection('usopen_playerScores').get();
      snap.docs.forEach((docSnap) => {
        const targetRef = eventRef.collection('playerScores').doc(docSnap.id);
        batch.set(targetRef, docSnap.data());
      });
    } catch (e) {
      console.warn('Could not migrate player scores:', e);
    }

    // Migrate playoff scores
    try {
      const snap = await adminDb.collection('usopen_playoffScores').get();
      snap.docs.forEach((docSnap) => {
        const targetRef = eventRef.collection('playoffScores').doc(docSnap.id);
        batch.set(targetRef, docSnap.data());
      });
    } catch (e) {
      console.warn('Could not migrate playoff scores:', e);
    }

    await batch.commit();
    console.log(`Successfully migrated legacy data to event ${eventId}.`);
    return { id: eventId, ...newEvent };
  }

  // Initialize a new empty event
  const newEvent: Omit<TournamentEvent, 'id'> = {
    name: "New Tournament",
    subtitle: "Draft Dashboard",
    espnEventId: eventId,
    startDate: TOURNAMENT_START_DATE,
    endDate: TOURNAMENT_END_DATE,
    cutline: null,
    playoffComplete: false,
    lastUpdated: FieldValue.serverTimestamp()
  };

  await eventRef.set(newEvent);
  return { id: eventId, ...newEvent };
}

/**
 * SERVER SIDE: Fetch all events in golf_events.
 */
export async function getAllEventsServer(): Promise<TournamentEvent[]> {
  const activeEventId = await getActiveEventIdServer();
  await ensureEventExistsServer(activeEventId); // Auto-migrate if needed

  const snap = await adminDb.collection('golf_events').get();
  return snap.docs.map((docSnap) => {
    const data = docSnap.data();
    return {
      id: docSnap.id,
      name: data.name || '',
      subtitle: data.subtitle || '',
      espnEventId: data.espnEventId || '',
      startDate: data.startDate || '',
      endDate: data.endDate || '',
      cutline: data.cutline !== undefined ? data.cutline : null,
      playoffComplete: !!data.playoffComplete,
      lastUpdated: data.lastUpdated ? data.lastUpdated.toDate() : null
    } as TournamentEvent;
  });
}
