# Next.js & React Architectural Audit Report: US Open 2026 Draft Dashboard

## 1. Executive Summary

A rigorous audit of the **US Open 2026 Draft Dashboard** reveals an application that is functional but carries significant technical debt, duplication, and architectural anti-patterns ("AI slop"). These liabilities degrade maintainability, increase the risk of run-time bugs during the live tournament, and limit future extensibility.

### Top 3 Architectural Liabilities

1.  **Severe Core Logic Duplication (The Dryness Violation):**
    The tournament's proprietary scoring logic—specifically, checking if a golfer is cut (`isPlayerCut`), calculating a participant's daily score (`calculateDailyScore`), and compiling standings statistics (`getParticipantStats`)—is copied and pasted across three separate layers: the public dashboard (`app/page.tsx`), the final standings component (`components/FinalStandings.tsx`), and the server-side standings API (`app/api/finalize-standings/route.ts`). If the tournament rules change, updates must be manually coordinated across all three files, introducing high probability for divergence and calculation bugs.
2.  **Bloated Component Monoliths (Mixing of Concerns):**
    Both `app/page.tsx` (584 lines) and `app/admin/page.tsx` (768 lines) act as monolithic controllers. They mix raw Firestore data subscriptions, complex business calculation logic, state management, client-side API requests, database seeding, and extensive JSX markup. These files violate the Single Responsibility Principle, making them difficult to test, scan, or modify.
3.  **Missing Performance Optimization (Uncontrolled Re-renders):**
    The application performs heavy computations—such as sorting and mapping all player scores, calculating complex payouts with tie-splitting, and parsing day money winners—directly in the render path. Because the countdown clock (`Countdown.tsx`) ticks every second, the entire page and all its children recompute these complex statistics on every tick. There is zero memoization (`useMemo`, `useCallback`) in the application, leading to CPU throttling and UI stuttering on low-powered devices.

---

## 2. The "Slop" Hit List

Below is a detailed breakdown of specific files, patterns, and code sections violating clean software architecture principles, their associated liabilities, and their exact conceptual fixes.

### A. Scoring Logic Triplication
*   **Target Files:**
    *   `app/page.tsx` (lines 121–187)
    *   `components/FinalStandings.tsx` (lines 38–79)
    *   `app/api/finalize-standings/route.ts` (lines 26–67)
*   **Liability:**
    The core tournament scoring rules (calculating the sum of the lowest two scores, applying the $999$ penalty for cut players on Days 3/4, and filtering active/cut players) are duplicated across these files. An adjustment to the rules (e.g., changing the cut penalty, adding a third active player, or modifying replacement rules) requires modifying three files.
*   **Conceptual Fix:**
    Extract all scoring, statistics generation, and status functions into a centralized pure utility module at `lib/scoring.ts`. Import these functions into the dashboard page, components, and API routes.

### B. Client-Side ESPN Fetching & Sync Logic Duplication
*   **Target Files:**
    *   `app/admin/page.tsx` (lines 171–277)
    *   `app/api/sync/route.ts` (lines 8–60)
*   **Liability:**
    The administrative interface fetches live scores directly from the ESPN API on the client side using browser `fetch()`. This duplicates the score parsing, event status checking, database writing, and timestamping logic found in the automated `/api/sync` cron route. It exposes the ESPN URL structure, poses potential CORS/user-agent block risks on the client, and duplicates database write batch code.
*   **Conceptual Fix:**
    Centralize the ESPN scraper in `lib/espn.ts` under a single shared function (`fetchAndSyncScores`). The `/api/sync` route should call this function. The Admin page's "Fetch Latest Scores" button should trigger a POST request to a server-side action or endpoint (e.g., `/api/sync?secret=...` or a Next.js Server Action) instead of doing the fetch and database updates on the client.

### C. Admin Whitelist Hardcoding
*   **Target Files:**
    *   `lib/constants.ts` (lines 41–45)
    *   `firestore.rules` (lines 42–45)
*   **Liability:**
    Authorized admin emails are hardcoded inside the code base and the Firestore security rules. Adding or removing an administrator requires editing code, pushing a deployment, and updating security rules. It also exposes private email addresses in git repository history.
*   **Conceptual Fix:**
    Move whitelisted emails entirely to environment variables (e.g., `ADMIN_EMAILS`) parsed in `lib/constants.ts`. For Firestore rules, query the `/usopen_users` collection dynamically by checking if the user document exists and has `role == 'admin'`, managing this record via Firebase console or administrative scripts.

### D. Monolithic Page Controllers
*   **Target Files:**
    *   `app/page.tsx` (584 lines)
    *   `app/admin/page.tsx` (768 lines)
*   **Liability:**
    Both pages violate separation of concerns. `AdminPage` contains dialog states, table rendering, database mutations, seeding scripts, and data structure defaults. `Dashboard` contains real-time subscriptions, sorting, payouts, day money, and overall layout.
*   **Conceptual Fix:**
    1.  Extract Firestore subscriptions into a custom hook `hooks/useTournamentData.ts` (for the dashboard) and `hooks/useAdminData.ts` (for the admin panel).
    2.  Extract tables, control panels, and dialogs into atomic sub-components (e.g., `components/admin/ParticipantTable.tsx`, `components/admin/ControlPanel.tsx`, `components/dashboard/PayoutCards.tsx`).
    3.  Move the static `INITIAL_PARTICIPANTS` and `INITIAL_GREEDY_PARTICIPANTS` data out of `app/admin/page.tsx` and place them in a JSON config or database seed script.

### E. Lack of Memoization
*   **Target Files:**
    *   `app/page.tsx`
    *   `components/FinalStandings.tsx`
*   **Liability:**
    The standings table, day money winners, and player scoreboard are computed in the render block. Because these files trigger child state changes (e.g., countdown timer ticking, tabs switching, dialogs opening), the CPU recalculates the standings from raw Firestore lists up to 60 times a minute.
*   **Conceptual Fix:**
    Wrap statistics processing, sorting, grouping, and day money winner lookups in `useMemo` blocks:
    ```typescript
    const participantStats = useMemo(() => {
      return participants.map(p => getParticipantStats(p, scores, cutline));
    }, [participants, scores, cutline]);
    ```

---

## 3. Proposed Folder Structure

To clean up technical debt and enforce separation of concerns, the directory structure should be reorganized as follows. This layout isolates UI presentation, hooks, server-side actions, core scoring logic, and shared TypeScript definitions.

```text
us-open-2026/
├── app/
│   ├── admin/
│   │   └── page.tsx                 # Light admin entry point (checks auth & renders AdminDashboard)
│   ├── api/
│   │   ├── finalize-standings/
│   │   │   └── route.ts             # Triggers server-side playoff logic using lib/scoring.ts
│   │   ├── seed/
│   │   │   └── route.ts             # Seeding database
│   │   └── sync/
│   │       └── route.ts             # Cron-sync endpoint (calls lib/espn.ts sync function)
│   ├── greedy/
│   │   └── page.tsx                 # Simple greedy dashboard component
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx                     # Clean entry point (uses hooks/useTournamentData.ts)
├── components/
│   ├── admin/                       # Admin-specific sub-components
│   │   ├── ControlPanel.tsx         # Sync, Seed, Clear, and Cutline control cards
│   │   ├── ParticipantTable.tsx     # Table of participants with Edit/Delete dialogs
│   │   └── SeedingDialogs.tsx       # Seeding confirmation modals
│   ├── dashboard/                   # Dashboard-specific sub-components
│   │   ├── Countdown.tsx            # Countdown banner
│   │   ├── DayMoneyWinners.tsx      # Day money cards
│   │   ├── FinalStandings.tsx       # Tied-resolved top 4 standings card
│   │   ├── LeaderboardTable.tsx     # Main participant leaderboard table
│   │   ├── PayoutsSection.tsx       # Tournament & Daily bonus prize tables
│   │   └── PlayerScoreboard.tsx     # Player rankings & drafted badges
│   └── ui/                          # Shadcn UI primitives (buttons, inputs, cards, tables, etc.)
├── hooks/
│   ├── useAdminData.ts              # Real-time state & mutations for Admin (fetch, seed, clear)
│   ├── useAuth.ts                   # Google Authentication hook
│   └── useTournamentData.ts         # Real-time Firestore subscriptions for Dashboard
├── lib/
│   ├── constants.ts                 # Shared constants (prizes, schedules, event IDs)
│   ├── espn.ts                      # ESPN API scrapers & sync tasks
│   ├── firebase-admin.ts            # Firebase Admin SDK setup (server-only)
│   ├── firebase.ts                  # Firebase Client SDK setup
│   ├── scoring.ts                   # Pure functions for scoring, tie-breaking, and payouts
│   └── utils.ts                     # Tailwind-merge utility
└── types/
    ├── index.ts                     # Domain interfaces (Participant, PlayerScore, Config)
    └── espn.ts                      # ESPN-specific response interfaces
```

---

## 4. Phase-by-Phase Refactoring Roadmap

This roadmap breaks down the architectural improvements into logical, incremental phases to ensure the application remains stable and functional throughout the process.

### Phase 1: Types & Centralized Scoring (The Core)
*   [ ] **Create Shared Types:** Define standard domain models in `types/index.ts` (`Participant`, `PlayerScore`, `PlayoffScore`, `TournamentConfig`). Replace inline interfaces in all pages and components with these imports.
*   [ ] **Centralize Scoring Logic:** Create `lib/scoring.ts` and write pure, fully-typed functions:
    *   `isPlayerCut(player: PlayerScore, cutline: number | null): boolean`
    *   `calculateDailyScore(participant: Participant, day: number, scores: Record<string, PlayerScore>, cutline: number | null): number`
    *   `getParticipantStats(participant: Participant, scores: Record<string, PlayerScore>, cutline: number | null): ParticipantStats`
    *   `calculatePayouts(stats: ParticipantStats[], prizes: Prize[]): Record<string, number>`
    *   `getDayMoneyWinners(participants: Participant[], scores: Record<string, PlayerScore>, day: number, cutline: number | null): DayMoneyWinner[]`
*   [ ] **Centralize Tie-Breaking Logic:** Move the `breakTie` hole-by-hole calculation out of `components/FinalStandings.tsx` and place it in `lib/scoring.ts` as a pure utility function.
*   [ ] **Import & Test:** Import the new scoring utilities into `app/page.tsx`, `components/FinalStandings.tsx`, and `app/api/finalize-standings/route.ts`. Verify that the dashboard rankings and scores match their original states.

### Phase 2: Centralizing Data Fetching & Syncing
*   [ ] **Centralize ESPN Scraper:** Extract ESPN parsing and synchronization code from `app/api/sync/route.ts` and `app/admin/page.tsx` into a single server-compatible function `syncEspnScores()` in `lib/espn.ts`.
*   [ ] **Admin Score Sync Re-route:** Refactor the "Fetch Scores" button on the Admin page to trigger a server-side endpoint or Server Action instead of directly executing Firestore writes from the client.
*   [ ] **Remove Hardcoded Seeding Lists:** Move the default participant seeding arrays (`INITIAL_PARTICIPANTS` and `INITIAL_GREEDY_PARTICIPANTS`) out of the page component file and place them in a dedicated config file or JSON resource.

### Phase 3: React Hooks & Data Orchestration
*   [ ] **Implement `useTournamentData` Hook:** Write `hooks/useTournamentData.ts` to manage:
    *   Real-time Firestore listeners for participants, scores, and config.
    *   Error states, loading states, and connection status.
    *   Memoized derivations (`allStats`, `payouts`, `dayMoneyWinners`, `playerRankings`) to prevent redundant execution on re-renders.
*   [ ] **Simplify Main Page:** Replace the 100+ lines of raw hooks and state definitions in `app/page.tsx` with a single call to `useTournamentData()`.
*   [ ] **Implement `useAdminData` Hook:** Write `hooks/useAdminData.ts` to coordinate CRUD operations (Edit/Delete participant), tournament config modifications (saving manual cutline), and triggers (Sync, Seed, Clear, Finalize Playoff).

### Phase 4: Component Decomposition
*   [ ] **Decompose Public Dashboard:** Break `app/page.tsx` down:
    *   Extract header and countdown into `components/dashboard/DashboardHeader.tsx`.
    *   Extract the prizes grid into `components/dashboard/PayoutsSection.tsx`.
    *   Ensure all presentational components (e.g., `LeaderboardTable`) receive pre-calculated, memoized data.
*   [ ] **Decompose Admin Dashboard:** Break `app/admin/page.tsx` down:
    *   Extract tables into `components/admin/ParticipantTable.tsx` and `components/admin/LiveScoresTable.tsx`.
    *   Extract operations into `components/admin/ControlPanel.tsx`.
    *   Extract dialog state wrappers so modals are only mounted when necessary.

### Phase 5: Security Auditing & Final Verification
*   [ ] **Admin Security Whitelist Environment Variable:** Replace hardcoded whitelist emails in `lib/constants.ts` and `firestore.rules` with environment variable checks. Update Firestore rules to look up authenticated roles dynamically in `/usopen_users`.
*   [ ] **Verify Code Splitting:** Confirm that components like `FinalStandings` and `ControlPanel` do not bundle duplicate server dependencies.
*   [ ] **Perform Render & Profiling Audits:** Use React DevTools Profiler to ensure that the dashboard does not trigger excessive re-renders when the countdown timer updates.
