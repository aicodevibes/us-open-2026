// lib/espn.ts

/**
 * Utility to fetch and parse golf leaderboard data from ESPN's unofficial API.
 * ESPN's golf leaderboard API typically lives at:
 * https://site.web.api.espn.com/apis/site/v2/sports/golf/leaderboard?event={eventId}
 */

import { adminDb } from './firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { ESPN_EVENT_ID } from './constants';

export { ESPN_EVENT_ID };
export const ESPN_API_URL = `https://site.web.api.espn.com/apis/site/v2/sports/golf/leaderboard?event=${ESPN_EVENT_ID}`;

export interface EspnHoleScore {
  period: number;   // Round number
  value: number;    // Score for the hole
  hole: number;     // Hole number (1-18)
}

export interface EspnPlayerScore {
  id: string;
  name: string;
  linescores: EspnHoleScore[]; // Array of hole scores
}

/**
 * Fetches the leaderboard and attempts to extract the round 4 hole-by-hole scores
 * for a specific list of player names.
 */
export async function fetchRound4HolesForPlayers(playerNames: string[]): Promise<Record<string, number[]>> {
  try {
    const response = await fetch(ESPN_API_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      next: { revalidate: 60 } // Cache for 60 seconds
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch ESPN data: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    
    const event = data.events?.[0];
    const competition = event?.competitions?.[0];
    const competitors = competition?.competitors || [];

    const playoffData: Record<string, number[]> = {};

    for (const competitor of competitors) {
      const athlete = competitor.athlete;
      const fullName = athlete?.displayName || "";

      if (playerNames.includes(fullName)) {
        const linescores: any[] = competitor.linescores || [];
        const holes: number[] = [];
        
        if (linescores.length >= 18) {
             for (let i = 0; i < 18; i++) {
                 holes.push(linescores[i].value || 0);
             }
        } else {
             console.warn(`Could not find 18 hole scores for ${fullName} in leaderboard response.`);
             for(let i=0; i<18; i++) holes.push(0);
        }

        playoffData[fullName] = holes;
      }
    }

    return playoffData;
  } catch (error) {
    console.error("Error fetching ESPN API data:", error);
    throw error;
  }
}

/**
 * Fetches scores from ESPN and syncs them to Firestore usopen_playerScores.
 * Updates config timestamp lastUpdated.
 */
export async function syncEspnScores(): Promise<{ success: boolean; message?: string; updatedCount?: number }> {
  try {
    console.log('Fetching live scores from ESPN URL:', ESPN_API_URL);
    const res = await fetch(ESPN_API_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      next: { revalidate: 0 } // bypass Next.js cache for sync
    });
    if (!res.ok) {
      throw new Error(`ESPN API returned HTTP ${res.status}`);
    }

    const espnData = await res.json();
    const event = espnData.events?.[0];
    if (!event) {
      throw new Error('No event found in ESPN response');
    }

    const statusState = event.status?.type?.state;
    const isPreEvent = statusState === 'pre';
    const competitors = event.competitions[0].competitors || [];

    console.log(`ESPN event status: ${event.status?.type?.description} (${statusState}), ${competitors.length} competitors`);

    if (competitors.length === 0 || isPreEvent) {
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

      return {
        success: true,
        message: 'Tournament has not started yet. Reset all player scores to 0.'
      };
    }

    // Process and update scores
    const batch = adminDb.batch();
    let updatedCount = 0;

    competitors.forEach((c: any) => {
      const rounds = [0, 0, 0, 0];
      const isCut = c.score === 'CUT' ||
        c.status?.type?.name === 'STATUS_CUT' ||
        c.status?.type?.description?.toLowerCase().includes('cut');

      if (c.linescores) {
        c.linescores.forEach((ls: any) => {
          if (ls.period >= 1 && ls.period <= 4) {
            const scoreVal = parseInt(ls.displayValue || ls.value || '0');
            rounds[ls.period - 1] = isNaN(scoreVal) ? 0 : scoreVal;
          }
        });
      }

      const playerName = c.athlete.displayName || c.athlete.fullName;
      const docRef = adminDb.collection('usopen_playerScores').doc(playerName);
      batch.set(docRef, {
        playerName,
        day1: rounds[0] ?? 0,
        day2: rounds[1] ?? 0,
        day3: rounds[2] ?? 0,
        day4: rounds[3] ?? 0,
        isCut: !!isCut,
      }, { merge: true });
      updatedCount++;
    });

    // Update last updated timestamp
    const configRef = adminDb.collection('usopen_config').doc('tournament');
    batch.set(configRef, {
      lastUpdated: FieldValue.serverTimestamp()
    }, { merge: true });

    await batch.commit();

    return {
      success: true,
      updatedCount
    };
  } catch (error) {
    console.error('syncEspnScores failed:', error);
    throw error;
  }
}
