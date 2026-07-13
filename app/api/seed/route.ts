// app/api/seed/route.ts

import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { getActiveEventIdServer, ensureEventExistsServer } from '@/lib/events-server';

interface SeedParticipantInput {
  name: string;
  players: string[];
}

/**
 * @api {post} /api/seed Seed Tournament Data
 * @apiName SeedTournament
 * @apiGroup Admin
 * @apiDescription Securely initializes the Firestore database with participant rosters for a specific event.
 * 
 * @apiBody {string} secret - The administrative CRON_SECRET for authentication.
 * @apiBody {Array} data - Array of participant objects: { name: string, players: string[] }.
 * @apiBody {string} [eventId] - The ID of the event to seed, defaults to the active event.
 */
export async function POST(request: Request) {
  try {
    const { secret, data, eventId } = await request.json() as { secret: string; data: SeedParticipantInput[]; eventId?: string };

    if (secret !== process.env.CRON_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!Array.isArray(data)) {
      return NextResponse.json({ error: 'Invalid data format. Expected an array of participants.' }, { status: 400 });
    }

    const targetEventId = eventId || await getActiveEventIdServer();
    await ensureEventExistsServer(targetEventId);

    const eventRef = adminDb.collection('theopen_events').doc(targetEventId);
    const batch = adminDb.batch();

    // 1. Clear existing participants in this event
    const existingParticipants = await eventRef.collection('participants').get();
    existingParticipants.forEach(doc => batch.delete(doc.ref));

    // 2. Add New Participants
    data.forEach((p) => {
      const docRef = eventRef.collection('participants').doc();
      batch.set(docRef, {
        name: p.name,
        players: p.players
      });
    });

    // 3. Initialize/Update Player Scores
    const allPlayers = Array.from(new Set(data.flatMap((p) => p.players)));
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

    return NextResponse.json({ 
      success: true, 
      participantsCount: data.length,
      playersCount: allPlayers.length 
    });
  } catch (error) {
    console.error('Seed failed:', error);
    return NextResponse.json({ 
      error: 'Seed failed', 
      details: error instanceof Error ? error.message : String(error) 
    }, { status: 500 });
  }
}
