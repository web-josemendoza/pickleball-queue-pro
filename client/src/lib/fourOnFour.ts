import type { QueuePlayer } from "./queue";

export interface CourtGroup {
  courtNumber: number;
  players: QueuePlayer[];
}

export interface CycleResult {
  cycleNumber: number;
  courts: CourtGroup[];
  waitingPlayers: QueuePlayer[];
}

export interface GameResult {
  courtNumber: number;
  players: QueuePlayer[];
  teamA: QueuePlayer[];
  teamB: QueuePlayer[];
  scoreA: number;
  scoreB: number;
  winnerIds: string[];
  loserIds: string[];
  completedAt: number;
}

export interface PlayerRecord {
  playerId: string;
  name: string;
  gamesPlayed: number;
  wins: number;
  losses: number;
  pointsFor: number;
  pointsAgainst: number;
}

/**
 * Split players into courts of four.
 *
 * Example:
 *
 * 12 players / 3 courts
 *
 * Court 1 = players 1-4
 * Court 2 = players 5-8
 * Court 3 = players 9-12
 */
export function createInitialCycle(
  players: QueuePlayer[],
  courtCount: number,
  cycleNumber = 1
): CycleResult {
  const playableCount = courtCount * 4;

  const playingPlayers = players.slice(
    0,
    playableCount
  );

  const waitingPlayers = players.slice(
    playableCount
  );

  const courts: CourtGroup[] = [];

  for (
    let courtIndex = 0;
    courtIndex < courtCount;
    courtIndex++
  ) {
    const start = courtIndex * 4;

    const courtPlayers = playingPlayers.slice(
      start,
      start + 4
    );

    if (courtPlayers.length === 4) {
      courts.push({
        courtNumber: courtIndex + 1,
        players: courtPlayers,
      });
    }
  }

  return {
    cycleNumber,
    courts,
    waitingPlayers,
  };
}

/**
 * Determine the winning and losing players
 * from one completed court.
 */
export function createGameResult(
  court: CourtGroup,
  scoreA: number,
  scoreB: number,
  completedAt = Date.now()
): GameResult {
  if (court.players.length !== 4) {
    throw new Error(
      `Court ${court.courtNumber} must have exactly 4 players.`
    );
  }

  if (
    !Number.isFinite(scoreA) ||
    !Number.isFinite(scoreB)
  ) {
    throw new Error(
      "Scores must be valid numbers."
    );
  }

  if (scoreA < 0 || scoreB < 0) {
    throw new Error(
      "Scores cannot be negative."
    );
  }

  if (scoreA === scoreB) {
    throw new Error(
      "A game cannot end in a tie."
    );
  }

  const teamA = court.players.slice(0, 2);
  const teamB = court.players.slice(2, 4);

  const teamAWon = scoreA > scoreB;

  const winners = teamAWon
    ? teamA
    : teamB;

  const losers = teamAWon
    ? teamB
    : teamA;

  return {
    courtNumber: court.courtNumber,
    players: court.players,
    teamA,
    teamB,
    scoreA,
    scoreB,
    winnerIds: winners.map(
      (player) => player.id
    ),
    loserIds: losers.map(
      (player) => player.id
    ),
    completedAt,
  };
}

/**
 * Separate all completed games into
 * winner and loser pools.
 */
export function separateWinnersAndLosers(
  results: GameResult[]
) {
  const winnerIds = new Set<string>();
  const loserIds = new Set<string>();

  for (const result of results) {
    result.winnerIds.forEach((id) =>
      winnerIds.add(id)
    );

    result.loserIds.forEach((id) =>
      loserIds.add(id)
    );
  }

  return {
    winnerIds,
    loserIds,
  };
}

/**
 * Create the next cycle.
 *
 * Winners are grouped with winners.
 * Losers are grouped with losers.
 *
 * Players who did not play remain available
 * for the next cycle.
 */
export function createNextCycle(
  players: QueuePlayer[],
  previousResults: GameResult[],
  courtCount: number,
  cycleNumber: number
): CycleResult {
  const playableCount = courtCount * 4;

  // IDs of everyone who just played
  const currentPlayerIds = new Set(
    previousResults.flatMap((result) =>
      result.players.map((player) => player.id)
    )
  );

  // Waiting players move to the front
  const waiting = players.filter(
    (player) => !currentPlayerIds.has(player.id)
  );

  // Players who just played move to the back
  const justPlayed = players.filter(
    (player) => currentPlayerIds.has(player.id)
  );

  const rotatedQueue = [
    ...waiting,
    ...justPlayed,
  ];

  // First courtCount * 4 players play
  const playingPlayers = rotatedQueue.slice(
    0,
    playableCount
  );

  // Everyone else waits
  const waitingPlayers = rotatedQueue.slice(
    playableCount
  );

  const courts: CourtGroup[] = [];

  for (
    let courtIndex = 0;
    courtIndex < courtCount;
    courtIndex++
  ) {
    const start = courtIndex * 4;

    const courtPlayers = playingPlayers.slice(
      start,
      start + 4
    );

    if (courtPlayers.length === 4) {
      courts.push({
        courtNumber: courtIndex + 1,
        players: courtPlayers,
      });
    }
  }

  return {
    cycleNumber,
    courts,
    waitingPlayers,
  };
}

/**
 * Update player statistics after a game.
 */
export function updatePlayerRecords(
  records: Record<string, PlayerRecord>,
  result: GameResult
): Record<string, PlayerRecord> {
  const next = {
    ...records,
  };

  const winnerSet = new Set(
    result.winnerIds
  );

  const loserSet = new Set(
    result.loserIds
  );

  for (const player of result.players) {
    const existing =
      next[player.id] ?? {
        playerId: player.id,
        name: player.name,
        gamesPlayed: 0,
        wins: 0,
        losses: 0,
        pointsFor: 0,
        pointsAgainst: 0,
      };

    const isWinner =
      winnerSet.has(player.id);

    const isLoser =
      loserSet.has(player.id);

    let pointsFor =
      existing.pointsFor;

    let pointsAgainst =
      existing.pointsAgainst;

    const isTeamA =
      result.teamA.some(
        (teamPlayer) =>
          teamPlayer.id === player.id
      );

    if (isTeamA) {
      pointsFor += result.scoreA;
      pointsAgainst += result.scoreB;
    } else {
      pointsFor += result.scoreB;
      pointsAgainst += result.scoreA;
    }

    next[player.id] = {
      ...existing,
      name: player.name,
      gamesPlayed:
        existing.gamesPlayed + 1,
      wins:
        existing.wins +
        (isWinner ? 1 : 0),
      losses:
        existing.losses +
        (isLoser ? 1 : 0),
      pointsFor,
      pointsAgainst,
    };
  }

  return next;
}

/**
 * Rank players by:
 *
 * 1. Wins
 * 2. Win percentage
 * 3. Point differential
 * 4. Games played
 */
export function rankPlayers(
  records: Record<string, PlayerRecord>
): PlayerRecord[] {
  return Object.values(records).sort(
    (a, b) => {
      if (b.wins !== a.wins) {
        return b.wins - a.wins;
      }

      const winRateA =
        a.gamesPlayed > 0
          ? a.wins / a.gamesPlayed
          : 0;

      const winRateB =
        b.gamesPlayed > 0
          ? b.wins / b.gamesPlayed
          : 0;

      if (winRateB !== winRateA) {
        return winRateB - winRateA;
      }

      const differentialA =
        a.pointsFor -
        a.pointsAgainst;

      const differentialB =
        b.pointsFor -
        b.pointsAgainst;

      if (
        differentialB !==
        differentialA
      ) {
        return (
          differentialB -
          differentialA
        );
      }

      return (
        b.gamesPlayed -
        a.gamesPlayed
      );
    }
  );
}