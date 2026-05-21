// lib/espn.ts

/**
 * Utility to fetch and parse golf leaderboard data from ESPN's unofficial API.
 * ESPN's golf leaderboard API typically lives at:
 * https://site.web.api.espn.com/apis/site/v2/sports/golf/leaderboard?event={eventId}
 */

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
      // It's often necessary to pass a user-agent to avoid being blocked
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      next: { revalidate: 60 } // Cache for 60 seconds
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch ESPN data: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    
    // ESPN JSON structure typically:
    // events[0] -> competitions[0] -> competitors[]
    const event = data.events?.[0];
    const competition = event?.competitions?.[0];
    const competitors = competition?.competitors || [];

    const playoffData: Record<string, number[]> = {};

    for (const competitor of competitors) {
      const athlete = competitor.athlete;
      const fullName = athlete?.displayName || "";

      // Check if this is one of the players we care about
      if (playerNames.includes(fullName)) {
        // Parse the linescores (hole-by-hole data)
        // Note: The structure of linescores can vary. Sometimes it's nested under competitor.linescores
        // It's typically an array of objects: { period: 4, value: 4 } where 'period' is the round or hole.
        // Assuming `linescores` contains the hole-by-hole scores for the current/final round.
        
        // As a fallback/placeholder, if the exact structure is different, this logic will need adjusting.
        const linescores: any[] = competitor.linescores || [];
        
        // We want 18 holes of data. 
        const holes: number[] = [];
        
        // In some ESPN formats, `linescores` represents round totals (4 items).
        // In detailed scorecards, `linescores` represents holes (18 items per round).
        // If linescores has 18 items, we map their values.
        if (linescores.length >= 18) {
             for (let i = 0; i < 18; i++) {
                 holes.push(linescores[i].value || 0); // fallback to 0
             }
        } else {
             // Fallback/Mock data generation if ESPN API doesn't return exactly 18 holes in this view.
             // You may need to query a different endpoint like the specific player's scorecard if 
             // the leaderboard doesn't have hole-by-hole data.
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
