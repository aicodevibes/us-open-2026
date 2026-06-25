// app/api/sync/route.ts

import { NextResponse } from 'next/server';
import { syncEspnScores } from '@/lib/espn';

export const dynamic = 'force-dynamic';

/**
 * GET /api/sync
 * Cron trigger endpoint to sync live ESPN scores with Firestore
 * Can pass ?eventId=... to sync a specific tournament event, otherwise defaults to the active event.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const secret = searchParams.get('secret');
  const eventId = searchParams.get('eventId') || undefined;

  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    console.log(`Starting score sync via cron API route for event: ${eventId || 'active event'}...`);
    const result = await syncEspnScores(eventId);
    
    return NextResponse.json({
      ...result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Automated sync route handler failed:', error);
    return NextResponse.json({
      error: 'Sync failed',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}
