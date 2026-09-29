export type RotationMode =
  | "SMART_2_ON_2_OFF"
  | "FOUR_ON_FOUR_OFF";

export type PlayerPool =
  | "unclassified"
  | "winner"
  | "loser"
  | "top"
  | "middle"
  | "lower";

export interface Player {
  id: string;
  name: string;
  joinedAt?: number;
}

export interface PlayerStats {
  playerId: string;
  playerName: string;

  gamesPlayed: number;
  wins: number;
  losses: number;

  pointsScored: number;
  pointsAllowed: number;

  pointDifferential: number;
  winPercentage: number;

  currentPool: PlayerPool;
}

export interface CourtAssignment {
  courtNumber: number;
  players: Player[];
}

export interface CycleGameResult {
  gameId: string;
  cycleNumber: number;

  courtNumber: number;

  players: Player[];

  teamA: Player[];
  teamB: Player[];

  teamAScore: number;
  teamBScore: number;

  winnerIds: string[];
  loserIds: string[];

  startedAt: number;
  completedAt: number;
}

export interface PlayCycle {
  cycleNumber: number;

  playerIds: string[];

  completedPlayerIds: string[];

  winnerIds: string[];
  loserIds: string[];

  startedAt: number;
  completedAt?: number;

  status:
    | "waiting"
    | "playing"
    | "classifying"
    | "completed";
}

export interface OpenPlaySession {
  mode: RotationMode;

  startedAt: number;
  endsAt: number;

  courtCount: number;

  currentCycle: number;

  status:
    | "waiting"
    | "playing"
    | "finished";
}