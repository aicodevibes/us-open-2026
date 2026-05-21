// lib/constants.ts

// 1. ESPN Golf Tournament API Event ID
// Find the 9-digit Event ID in ESPN's URL or API.
export const ESPN_EVENT_ID = process.env.NEXT_PUBLIC_ESPN_EVENT_ID || "401811947";

// 2. Tournament Details
export const TOURNAMENT_NAME = "US Open 2026";
export const TOURNAMENT_SUBTITLE = "Draft Dashboard";

// Dates (ISO 8601 Format / UTC) for the Countdown Clock
export const TOURNAMENT_START_DATE = "2026-05-14T12:00:00Z"; // Thursday 8:00 AM EDT
export const TOURNAMENT_END_DATE = "2026-05-17T22:00:00Z";   // Sunday evening conclusion

// 3. Prizes & Pools (Main Tournament)
export const PRIZES = [
  { rank: '1st', amount: '$600.00', value: 600 },
  { rank: '2nd', amount: '$320.00', value: 320 },
  { rank: '3rd', amount: '$180.00', value: 180 },
  { rank: '4th', amount: '$100.00', value: 100 },
];

export const DAILY_BONUSES = [
  { day: 'Day 1', amount: '$75.00' },
  { day: 'Day 2', amount: '$75.00' },
  { day: 'Day 3', amount: '$75.00' },
  { day: 'Day 4', amount: '$75.00' },
];

// 4. Greedy Side-Game Config
export const GREEDY_PRIZE_POOL = "$175.00";

// 5. Admin Security Whitelist
// Can be configured via env var ADMIN_EMAILS (comma-separated).
// Falls back to local organizers for ease of use.
export function getAuthorizedEmails(): string[] {
  const envEmails = process.env.NEXT_PUBLIC_ADMIN_EMAILS || process.env.ADMIN_EMAILS;
  if (envEmails) {
    return envEmails.split(',').map(email => email.trim().toLowerCase());
  }
  return [
    'jamesrobertlosinger@gmail.com',
    'jl4798@gmail.com',
    'aicodevibes@gmail.com'
  ];
}
