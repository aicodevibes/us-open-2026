import { NextResponse } from 'next/server';
import { syncEspnScores } from '@/lib/espn';

export const dynamic = 'force-dynamic';

/**
 * GET /api/sync
 * Cron trigger endpoint to sync live ESPN scores with Firestore
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const secret = searchParams.get('secret');

  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    console.log('Starting automated score sync via cron API route...');
    const result = await syncEspnScores();
    
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
