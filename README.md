<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/95f2e580-05f4-4eac-8464-e68a0f9ff783

## Deployment

This app is deployed using **Firebase App Hosting**. 

- **Backend ID:** `us-open-2026`
- **Region:** `us-east4`
- **Classic Hosting:** (Disabled) The legacy Cloud Run service has been deleted to focus on the App Hosting backend.

### How to Deploy
Deployments are automatically triggered when changes are pushed to the main branch of the linked GitHub repository.

To manually trigger a rollout or manage the backend:
`npx firebase apphosting:backends:get us-open-2026`

## Run Locally

**Prerequisites:** Node.js

1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in `.env.local` to your Gemini API key.
3. Run the app:
   `npm run dev`

## Documentation & Replication

For details on the project architecture and tournament scoring rules:
- [Product Requirements Document (PRD)](file:///c:/Dev/us-open/prd.md): Details game formats, scoring rules, and overall prize pools.
- [Public UI Logic Review](file:///c:/Dev/us-open/logic.md): Documents the technical implementation details of payouts, day money, and playoff scorecard logic.

To replicate the project for a new tournament, update the centralized configurations in [constants.ts](file:///c:/Dev/us-open/lib/constants.ts):
1. **ESPN Event ID**: Update `ESPN_EVENT_ID` to the ID of the new golf event.
2. **Start/End Dates**: Update `TOURNAMENT_START_DATE` and `TOURNAMENT_END_DATE` (UTC) to control the countdown timer.
3. **Prizes & Pools**: Adjust the payout numbers inside `PRIZES`, `DAILY_BONUSES`, and `GREEDY_PRIZE_POOL`.
4. **Draft Rosters**: Edit the initial seed arrays (`INITIAL_PARTICIPANTS` and `INITIAL_GREEDY_PARTICIPANTS`) in [admin/page.tsx](file:///c:/Dev/us-open/app/admin/page.tsx#L21-L44) before running database setup.

---

## Public Repository Guidelines & Security

If you plan to make this repository public on GitHub, follow these guidelines to keep your setup secure and prevent exposing personal information:

### 1. Remove Hardcoded Admin Emails (Public Code Safe)
By default, the application checks a fallback list of emails in `lib/constants.ts`. Before making the repository public:
* Define the environment variable `NEXT_PUBLIC_ADMIN_EMAILS` (a comma-separated list, e.g., `user1@example.com,user2@example.com`) in your Firebase App Hosting environment dashboard.
* Alternatively, clear the fallback list in `lib/constants.ts` to ensure no personal email addresses are saved in Git history.

### 2. Update Firestore Security Rules
Currently, [firestore.rules](file:///c:/Dev/us-open/firestore.rules) contains hardcoded admin emails. To make it secure and public-ready:
1. Delete the hardcoded email check lines in [firestore.rules](file:///c:/Dev/us-open/firestore.rules#L42-L44).
2. Enable database role validation. The security rules already support looking up an admin role from a `users` collection:
   ```javascript
   match /databases/{database}/documents {
     match /{document=**} {
       allow write: if request.auth != null && 
         exists(/databases/$(database)/documents/users/$(request.auth.uid)) && 
         get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
     }
   }
   ```
3. To assign an admin, simply log into the Firebase Console, navigate to your Firestore database, create a document in the `users` collection with the document ID set to your Google Account's Firebase Auth `UID`, and add a field `role: "admin"`.

### 3. Manage Environment Variables & Secrets
* **CORS & Public API Overrides**: You can override the ESPN Event ID without editing the code by defining the `NEXT_PUBLIC_ESPN_EVENT_ID` environment variable.
* **Never Commit Credentials**: Ensure `.env.local` is listed in your `.gitignore` file and do not commit any Google Service Account JSON keys or Firebase credentials.


