# Product Requirements Document (PRD)
**US Open Draft Dashboard & Greedy Side-Game**

---

## 1. Overview & Context

This project provides a tournament-tracking dashboard for a **12-participant US Open draft contest**. It aggregates live professional golf leaderboard data from ESPN to display participant standings, calculate payouts, track a daily "Day Money" prize, and host a separate "Greedy" side-game.

The system is designed to run automatically during the tournament (via cron score synchronization) and allows administrators to manually update data, seed rosters, and run playoff tie-breakers when the tournament concludes.

---

## 2. Roster Rules & Draft Format

### A. Main Tournament
* **Participants**: Exactly 12 participants.
* **Roster Size**: Each participant drafts a roster of **3 players** before the tournament starts.
* **Lineup Constraints**: 
  * On Day 1 and Day 2, all drafted players are active.
  * After the Day 2 cut line, if any players are cut, they are deactivated. If a participant has active players remaining, they continue competing.

### B. Greedy Side-Game
* **Participants**: A subset of participants (e.g., 7 participants).
* **Format**: Each participant is assigned a single golfer.
* **Prizing**: Winner-takes-all ($175.00 total purse).

---

## 3. Scoring & Leaderboard Rules

### A. Daily Score Calculation
* For each day (1 to 4), a participant’s score is computed by taking the **sum of the two lowest scores** shot by their drafted players on that specific day.
* **Day 1 & Day 2**: Players drafted at position 4 or later (if any) do not contribute to scores. Only the top 3 drafted spots are considered.
* **Day 3 & Day 4 (Cut Handling)**: 
  * Golfer cuts are checked dynamically (based on a cutline configuration value or ESPN status).
  * Any player who has been cut is assigned a dummy penalty score of **999** for Day 3 and Day 4. 
  * This effectively excludes them from the "lowest two" calculation, unless a participant has fewer than two active golfers remaining.
* **Participant Cut Status**: If a participant has **zero active players** remaining after the Day 2 cut line, they are marked as "Cut" (`isCut: true`). Cut participants are automatically sorted to the bottom of the standings.

### B. Overall Score
* The total participant score is the cumulative sum of the calculated daily scores across all 4 days.
* Standing positions are sorted with active participants first (ranked by total score ascending), and cut participants at the bottom.
* Standard competition tie handling is used (e.g., ranks 1, 2, 2, 4).

### C. Day Money
* **Eligibility**: Only drafted golfers are eligible to win Day Money. Undrafted golfers shot-making does not count.
* **Winner Selection**: The participant who owns the golfer with the lowest score for that specific day is awarded Day Money ($75.00 total pool per day).
* **Tie Splitting**: If multiple drafted golfers tie for the lowest score of the day, the $75.00 pool is split equally among the participants who own those golfers.
* **Cut Handling**: Cut golfers are ineligible for Day Money on Day 3 and Day 4.

---

## 4. Payouts & Tie-Breakers

### A. Main Tournament Payouts
* **Prize Pool**: 1st ($600), 2nd ($320), 3rd ($180), and 4th ($100).
* **Purse Splitting**: If participants tie for a payout position, the prize pools for the occupied ranks are combined and divided equally. (e.g., a two-way tie for 2nd splits 2nd and 3rd place prizes: `($320 + $180) / 2 = $250` each).

### B. Scorecard Playoff Finalization
* To resolve ties in the Top 4 and establish final standings, a **Scorecard Playoff** can be triggered at the end of Round 4.
* **Hole-by-Hole Playoff Logic**:
  * For tied participants, their two best-performing golfers on Day 4 are identified.
  * The system compares the combined scores of these two golfers hole-by-hole starting at Hole 1 through Hole 18.
  * The first participant to have a lower combined hole score wins the tie-breaker and occupies the higher position.
  * Playoff data is fetched from ESPN's detailed linescores.

---

## 5. System Features & Control Panel

* **Google Authentication**: Admin access is gated using a custom `useAuth` hook and authorized email lists.
* **Server-Side Operations**: Database modifications (seeding, clearing, updating rosters) are handled securely on the server via Next.js Server Actions.
* **Data Seeding**: Roster seeds and Greedy game configurations are initialized securely.
* **Live Sync**: Automated score synchronization via a secure `/api/sync?secret=...` cron endpoint.
* **Manual Override**: Allows setting a manual cutline value in Firestore configuration to override automatic ESPN cut statuses.
* **Finalize Playoff**: Scorecard playoff calculations trigger detailed linescore scrapers from ESPN to resolve Top 4 standings.

---

## 6. Technical Stack

* **Frontend Framework**: Next.js 16 & React 19.
* **State & Data Flow**: Custom React Hooks (`useAuth`) and modular presentational components (`Countdown`, `LeaderboardTable`, `PlayerScoreboard`, `FinalStandings`).
* **Database**: Cloud Firestore (Real-time subscriptions via `onSnapshot` client side; Admin SDK writes on the server).
* **Deployment**: Firebase App Hosting.

---

## 7. Security & Architecture Recommendations (Future Scope)

For future tournament iterations, the following improvements should be considered to enhance safety, performance, and maintainability:

### A. Access Control & API deprecation
* **Deprecate Unused API Endpoints**: Remove the `app/api/finalize-standings/route.ts` file since finalization is now fully performed via the authenticated `finalizePlayoffAction` Server Action. Leaving the unauthenticated API endpoint exposes the database to unauthorized mutations.
* **Centralize Environment Secrets**: Migrate `CRON_SECRET` from plaintext configuration files (`apphosting.yaml`) to Google Cloud Secret Manager. Reference the secret using `secret: CRON_SECRET_REF` to prevent credential exposure in the source repository.
* **Dynamic Role-Based Access Control**: Remove hardcoded personal email addresses from `firestore.rules`. Rely exclusively on a query checks against a secure `/usopen_users/{userId}` user roles collection.

### B. Business Logic DRYness
* **Centralize Scoring Logic**: Extract player cut calculations, daily scores, and payouts into a centralized `lib/scoring.ts` utility. Import these functions in `app/page.tsx`, `components/FinalStandings.tsx`, and the server APIs to eliminate duplicate logic.
* **Render Memoization**: Wrap standings calculations, standings sorting, and day money winner lookups in `useMemo` blocks inside client views to prevent recalculating them on every second (during countdown ticks).
