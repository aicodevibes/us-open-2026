// components/Countdown.tsx
'use client';

/**
 * @file components/Countdown.tsx
 * @description A countdown timer component that displays the time left until the tournament starts,
 * or status indicators if the tournament is in progress or completed.
 */

import { useState, useEffect } from 'react';
import { Trophy, Timer } from 'lucide-react';
import { TOURNAMENT_START_DATE, TOURNAMENT_END_DATE } from '@/lib/constants';

interface TimeLeft {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

interface CountdownProps {
  startDate?: string;
  endDate?: string;
}

/**
 * Countdown component that displays time remaining until the specified tournament start date.
 * If the current time is between start and end date, it displays "TOURNAMENT IN PROGRESS".
 * If the current time is past the end date, it displays "TOURNAMENT COMPLETED".
 */
export function Countdown({ startDate = TOURNAMENT_START_DATE, endDate = TOURNAMENT_END_DATE }: CountdownProps) {
  const [timeLeft, setTimeLeft] = useState<TimeLeft | null>(null);
  const [hasStarted, setHasStarted] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);

  useEffect(() => {
    const startMs = new Date(startDate).getTime();
    const endMs = new Date(endDate).getTime();

    const updateTimer = () => {
      const now = new Date().getTime();
      
      if (now > endMs) {
        setIsCompleted(true);
        setHasStarted(true);
        return true; // flag to clear interval
      }
      
      if (now > startMs) {
        setHasStarted(true);
        setIsCompleted(false);
        return true; // flag to clear interval
      }

      const distance = startMs - now;
      setTimeLeft({
        days: Math.floor(distance / (1000 * 60 * 60 * 24)),
        hours: Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
        minutes: Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60)),
        seconds: Math.floor((distance % (1000 * 60)) / 1000),
      });
      return false;
    };

    // Run once immediately
    const shouldStop = updateTimer();
    if (shouldStop) return;

    const timer = setInterval(() => {
      const shouldStopNow = updateTimer();
      if (shouldStopNow) {
        clearInterval(timer);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [startDate, endDate]);

  if (isCompleted) {
    return (
      <div className="bg-[#05041a] text-[#ffba00] border border-[#ffba00]/50 px-4 py-2 rounded-full font-bold text-sm flex items-center gap-2">
        <Trophy className="w-4 h-4" />
        TOURNAMENT COMPLETED
      </div>
    );
  }

  if (hasStarted) {
    return (
      <div className="bg-[#ffba00] text-[#05041a] px-4 py-2 rounded-full font-bold text-sm flex items-center gap-2 animate-pulse">
        <div className="w-2 h-2 bg-[#06051e] rounded-full" />
        TOURNAMENT IN PROGRESS
      </div>
    );
  }

  if (!timeLeft) return null;

  return (
    <div className="flex items-center gap-4 bg-[#05041a] p-3 rounded-lg border border-white/20">
      <Timer className="w-5 h-5 text-[#ffba00]" />
      <div className="flex gap-3 text-white font-mono">
        <div className="text-center">
          <span className="block text-lg font-bold">{timeLeft.days}</span>
          <span className="text-[8px] uppercase opacity-60">Days</span>
        </div>
        <div className="text-center">
          <span className="block text-lg font-bold">{timeLeft.hours}</span>
          <span className="text-[8px] uppercase opacity-60">Hrs</span>
        </div>
        <div className="text-center">
          <span className="block text-lg font-bold">{timeLeft.minutes}</span>
          <span className="text-[8px] uppercase opacity-60">Min</span>
        </div>
        <div className="text-center">
          <span className="block text-lg font-bold">{timeLeft.seconds}</span>
          <span className="text-[8px] uppercase opacity-60">Sec</span>
        </div>
      </div>
    </div>
  );
}
