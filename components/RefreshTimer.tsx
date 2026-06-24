// components/RefreshTimer.tsx
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface RefreshTimerProps {
  intervalMs?: number;
}

/**
 * Client component that triggers router.refresh() at a specified interval.
 * This instructs Next.js to fetch new data from the server and re-render 
 * Server Components in-place without losing client state.
 */
export function RefreshTimer({ intervalMs = 60000 }: RefreshTimerProps) {
  const router = useRouter();

  useEffect(() => {
    // Standard polling timer
    const timer = setInterval(() => {
      console.log(`Polling sync: router.refresh() triggered every ${intervalMs / 1000}s`);
      router.refresh();
    }, intervalMs);

    return () => clearInterval(timer);
  }, [router, intervalMs]);

  return null;
}
