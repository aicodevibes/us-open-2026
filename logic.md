# Public UI Logic Review - US Open 2026 Draft Dashboard
**Last Updated: 2026-05-11 13:11 EDT**

This document summarizes the core logic implemented in the public-facing dashboard (`app/page.tsx`).

## 1. Scoring Logic (Participant Level)
*   **Daily Score Calculation**: For each day (1-4), a participant's score is determined by taking the **sum of the two lowest scores** shot by their drafted players on that day.
*   **Cut Player Handling**: 
    *   On Day 3 and Day 4, any player marked as `isCut: true` is assigned a dummy score of `999`. 
    *   This ensures they are excluded from the "lowest two" calculation unless the participant has fewer than two active players remaining.
*   **Total Score**: The cumulative sum of the calculated daily scores for all four tournament days.
*   **Participant "Cut" Status**: A participant is flagged as "Cut" if they have **zero active players** (non-cut) remaining on their roster after the Day 2 cut line. Cut participants are automatically sorted to the bottom of the leaderboard regardless of their numeric score.

## 2. Ranking Logic
*   **Sorting**: Participants are sorted by `isCut` status (active first) and then by `total` score (lowest to highest).
*   **Tie Handling**: The system uses standard competition ranking (e.g., 1, 2, 2, 4). 
    *   If multiple participants share the same score, they are assigned the same rank.
    *   The rank is determined by the `index + 1` of the first person in that score group.
*   **Visual Styling**: The top 4 ranks are highlighted with specific background colors:
    *   **Rank 1**: Gold
    *   **Rank 2**: Silver
    *   **Rank 3**: Bronze
    *   **Rank 4**: Copper

## 3. Payout & Prize Logic
*   **Prize Pools**: Defined as 1st ($600), 2nd ($320), 3rd ($180), and 4th ($100).
*   **Purse Splitting**: In the event of ties, the prize pools for the occupied ranks are combined and divided equally among the tied participants.
    *   *Example*: If two participants tie for 2nd, they split the 2nd and 3rd place prize pools ($320 + $180 = $500 total, resulting in $250 each).
*   **Display State**: Payouts are calculated dynamically for the overall leaderboard but are hidden in the main scoreboard UI per user request. However, official final payouts (incorporating any playoff tie-breaker resolution) are displayed in the **Official Final Standings** component when the tournament is finalized.


## 4. Day Money Logic
*   **Drafted Only**: The logic only considers players who were actually selected by at least one participant in the draft. Undrafted players shooting low scores do not trigger Day Money.
*   **Winner Selection**: The participant(s) who own the player(s) with the lowest score for that specific day are identified as the winners.
*   **Start-of-Day Detection**: To prevent "false winners" before a round begins, a day is considered "not started" if the minimum and maximum scores for all drafted players are both exactly `0`.
*   **Cut Handling**: For Day 3 and Day 4, players who have been cut from the tournament are excluded from Day Money eligibility.

## 5. Tournament Status & Countdown
*   **Target Date**: The countdown is set for **May 14, 2026, 12:00 PM UTC**.
*   **Live Status**: Once the target date passes, the countdown is replaced by a pulsing "TOURNAMENT IN PROGRESS" indicator.
*   **Last Updated**: Displays the `lastUpdated` timestamp from the `config/tournament` document in Firestore, converted to the user's local time.

## 6. Code Maintenance & Review Items
*   **Centralized Scoring Logic**: Currently, the participant score calculation (lowest two active players) is duplicated in `app/page.tsx`, `components/FinalStandings.tsx`, and `app/api/finalize-standings/route.ts`. It should be refactored into a shared utility.
*   **Hardcoded Settings**: Core configurations like the ESPN Event ID, start/end dates, and admin email lists are hardcoded in multiple locations and should be unified in a config file for easier replication.
*   **Playoff Indexing Resolution**: The scorecard playoff was updated to correctly map 1-indexed golf holes to the 0-indexed playoff scorecards array (`round4Holes[h - 1]`).

