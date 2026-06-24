// types/index.ts

export interface Participant {
  id: string;
  name: string;
  players: string[];
}

export interface GreedyParticipant {
  id: string;
  name: string;
  player: string;
}

export interface PlayerScore {
  id: string;
  playerName: string;
  day1: number;
  day2: number;
  day3: number;
  day4: number;
  isCut?: boolean;
}

export interface PlayoffScore {
  playerName: string;
  round4Holes: number[];
  updatedAt?: any;
}

export interface TournamentConfig {
  lastUpdated: Date | null;
  cutline: number | null;
  playoffComplete: boolean;
}

export interface ParticipantStats {
  id: string;
  name: string;
  players: string[];
  stats: {
    d1: number;
    d2: number;
    d3: number;
    d4: number;
    total: number;
    isCut: boolean;
  };
  rank: number | string;
  payout: number;
}

export interface Prize {
  rank: string;
  amount: string;
  value: number;
}

export interface DailyBonus {
  day: string;
  amount: string;
}
