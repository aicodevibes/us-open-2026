import { NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

import { ESPN_EVENT_ID } from '@/lib/constants';

/**
 * Helper function to fetch and transform US Open scores from ESPN.
 * @returns {Promise<Array<{playerName: string, scores: number[], isCut: boolean}>>}
 * @throws {Error} If the ESPN API call fails or the response format is unexpected.
 */
async function fetchUSOpenScoresFromESPN() {
  const espnUrl = `https://site.web.api.espn.com/apis/site/v2/sports/golf/leaderboard?event=${ESPN_EVENT_ID}`;

  const res = await fetch(espnUrl);
  if (!res.ok) {
    throw new Error(`ESPN API returned HTTP ${res.status}`);
  }

  const espnData = await res.json();
  const event = espnData.events?.[0];
  if (!event) {
    throw new Error('No event found in ESPN response');
  }

  const statusState = event.status?.type?.state; // 'pre', 'in', or 'post'
  const isPreEvent = statusState === 'pre';
  const competitors = event.competitions[0].competitors || [];

  console.log(`ESPN event status: ${event.status?.type?.description} (${statusState}), ${competitors.length} competitors`);

  if (competitors.length === 0) {
    return [];
  }

  return competitors.map((c: any) => {
    const rounds = [0, 0, 0, 0];

    // Detect if player is cut
    const isCut = c.score === 'CUT' ||
      c.status?.type?.name === 'STATUS_CUT' ||
      c.status?.type?.description?.toLowerCase().includes('cut');

    // Only parse linescores if it's NOT a pre-event
    if (!isPreEvent && c.linescores) {
      c.linescores.forEach((ls: any) => {
        if (ls.period >= 1 && ls.period <= 4) {
          const scoreVal = parseInt(ls.displayValue || ls.value || '0');
          rounds[ls.period - 1] = isNaN(scoreVal) ? 0 : scoreVal;
        }
      });
    }

    return {
      playerName: c.athlete.displayName || c.athlete.fullName,
      scores: rounds,
      isCut: isCut,
    };
  });
}

/**
 * @api {get} /api/sync Synchronize Live Scores
 * @apiName SyncScores
 * @apiGroup Automated
 * @apiDescription Triggers a synchronization between the live ESPN leaderboard and Firestore.
 * 
 * @apiQuery {string} secret - The CRON_SECRET used for authentication (usually provided by Cloud Scheduler).
 * 
 * @apiSuccess {boolean} success - Indicates if the sync was successful.
 * @apiSuccess {number} updatedCount - Total number of player scores updated.
 * @apiSuccess {string} timestamp - ISO timestamp of the sync.
 * 
 * @apiError (401) Unauthorized - If the secret query parameter is missing or incorrect.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const secret = searchParams.get('secret');

  // Security check: Ensure the request has the correct secret (for automated cron sync)
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    console.log('Starting automated score sync...');
    const results = await fetchUSOpenScoresFromESPN();

    if (!results || results.length === 0) {
      console.log('Tournament has not started. Resetting player scores to 0...');
      
      const batch = adminDb.batch();

      // 1. Reset existing scores
      const sSnap = await adminDb.collection('usopen_playerScores').get();
      sSnap.docs.forEach((doc) => {
        batch.update(doc.ref, {
          day1: 0,
          day2: 0,
          day3: 0,
          day4: 0,
          isCut: false
        });
      });

      // 2. Fetch all participants to ensure drafted players are initialized
      const pSnap = await adminDb.collection('usopen_participants').get();
      const draftedPlayers = new Set<string>();
      pSnap.docs.forEach(doc => {
        const data = doc.data();
        if (Array.isArray(data.players)) {
          data.players.forEach((pName: string) => draftedPlayers.add(pName));
        }
      });

      draftedPlayers.forEach((playerName) => {
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

      // Update last updated timestamp
      const configRef = adminDb.collection('usopen_config').doc('tournament');
      batch.set(configRef, {
        lastUpdated: FieldValue.serverTimestamp()
      }, { merge: true });

      await batch.commit();

      return NextResponse.json({
        success: true,
        message: 'Tournament has not started yet. Reset all player scores to 0.',
        timestamp: new Date().toISOString()
      });
    }

    // Use Admin SDK to write scores (bypasses Firestore security rules)
    const batch = adminDb.batch();

    results.forEach((item: any) => {
      const docRef = adminDb.collection('usopen_playerScores').doc(item.playerName);
      batch.set(docRef, {
        playerName: item.playerName,
        day1: item.scores[0] ?? 0,
        day2: item.scores[1] ?? 0,
        day3: item.scores[2] ?? 0,
        day4: item.scores[3] ?? 0,
        isCut: item.isCut ?? false,
      }, { merge: true });
    });

    // Update last updated timestamp
    const configRef = adminDb.collection('usopen_config').doc('tournament');
    batch.set(configRef, {
      lastUpdated: FieldValue.serverTimestamp()
    }, { merge: true });

    await batch.commit();

    return NextResponse.json({
      success: true,
      updatedCount: results.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Automated sync failed:', error);
    return NextResponse.json({
      error: 'Sync failed',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}
