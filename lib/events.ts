// lib/events.ts

import { db } from './firebase';
import { collection, getDocs, doc, getDoc } from 'firebase/firestore';
import { TournamentEvent } from '@/types';
import { ESPN_EVENT_ID } from './constants';

// Global config path: golf_config/activeEvent
// Field: activeEventId

/**
 * CLIENT SIDE: Retrieve the active event ID.
 */
export async function getActiveEventIdClient(): Promise<string> {
  try {
    const activeDocRef = doc(db, 'theopen_config', 'activeEvent');
    const activeDocSnap = await getDoc(activeDocRef);
    if (activeDocSnap.exists()) {
      const data = activeDocSnap.data();
      if (data?.activeEventId) {
        return data.activeEventId;
      }
    }
  } catch (e) {
    console.error('Error fetching active event ID client side:', e);
  }
  return ESPN_EVENT_ID; // Fallback
}

/**
 * CLIENT SIDE: Fetch all events in theopen_events.
 */
export async function getAllEventsClient(): Promise<TournamentEvent[]> {
  const snap = await getDocs(collection(db, 'theopen_events'));
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
