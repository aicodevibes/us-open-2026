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

/**
 * Countdown component that displays time remaining until TOURNAMENT_START_DATE.
 * If the current time is between start and end date, it displays "TOURNAMENT IN PROGRESS".
 * If the current time is past the end date, it displays "TOURNAMENT COMPLETED".
 * 
 * @returns {JSX.Element | null} Countdown UI or tournament status banner.
 */
export function Countdown() {
  const [timeLeft, setTimeLeft] = useState<TimeLeft | null>(null);
  const [hasStarted, setHasStarted] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);

  useEffect(() => {
    const startDate = new Date(TOURNAMENT_START_DATE).getTime();
    const endDate = new Date(TOURNAMENT_END_DATE).getTime();

    const timer = setInterval(() => {
      const now = new Date().getTime();
      
      if (now > endDate) {
        setIsCompleted(true);
        setHasStarted(true);
        clearInterval(timer);
        return;
      }
      
      if (now > startDate) {
        setHasStarted(true);
        clearInterval(timer);
        return;
      }

      const distance = startDate - now;
      setTimeLeft({
        days: Math.floor(distance / (1000 * 60 * 60 * 24)),
        hours: Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
        minutes: Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60)),
        seconds: Math.floor((distance % (1000 * 60)) / 1000),
      });
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  if (isCompleted) {
    return (
      <div className="bg-[#001A2E] text-[#D4AF37] border border-[#D4AF37]/50 px-4 py-2 rounded-full font-bold text-sm flex items-center gap-2">
        <Trophy className="w-4 h-4" />
        TOURNAMENT COMPLETED
      </div>
    );
  }

  if (hasStarted) {
    return (
      <div className="bg-[#D4AF37] text-[#001A2E] px-4 py-2 rounded-full font-bold text-sm flex items-center gap-2 animate-pulse">
        <div className="w-2 h-2 bg-[#00365F] rounded-full" />
        TOURNAMENT IN PROGRESS
      </div>
    );
  }

  if (!timeLeft) return null;

  return (
    <div className="flex items-center gap-4 bg-[#001A2E] p-3 rounded-lg border border-white/20">
      <Timer className="w-5 h-5 text-[#D4AF37]" />
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
