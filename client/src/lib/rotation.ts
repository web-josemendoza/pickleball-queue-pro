import type { QueuePlayer } from "./queue";

export const COURT_SIZE = 4;
export const TEAM_SIZE = 2;
export const MAX_CONSECUTIVE_GAMES = 2;

export type RotationMode =
  | "SMART_2_ON_2_OFF"
  | "FOUR_ON_FOUR_OFF";

export interface RotationPlayer extends QueuePlayer {
  consecutiveGames?: number;
}

/**
 * Remove invalid players.
 *
 * This is important because Firebase must NEVER receive:
 *
 * {
 *   id: undefined,
 *   name: undefined
 * }
 */
export function sanitizePlayers(
  players: QueuePlayer[]
): QueuePlayer[] {
  return players.filter(
    (player): player is QueuePlayer =>
      Boolean(
        player &&
        player.id &&
        player.name &&
        player.name.trim()
      )
  );
}

/**
 * First game:
 * take the first 4 valid players.
 */
export function getInitialPlayers(
  players: QueuePlayer[]
): RotationPlayer[] {
  return sanitizePlayers(players)
    .slice(0, COURT_SIZE)
    .map((player) => ({
      ...player,
      consecutiveGames: 1,
    }));
}

/**
 * Find the winning team.
 */
export function getWinningTeam(
  courtPlayers: RotationPlayer[],
  winnerIds: string[]
): RotationPlayer[] {
  return courtPlayers.filter((player) =>
    winnerIds.includes(player.id)
  );
}

/**
 * Find the losing team.
 */
export function getLosingTeam(
  courtPlayers: RotationPlayer[],
  winnerIds: string[]
): RotationPlayer[] {
  return courtPlayers.filter(
    (player) => !winnerIds.includes(player.id)
  );
}

/**
 * Determine whether the winning team has reached
 * the maximum consecutive-game limit.
 */
export function mustRotateWinnerTeam(
  winners: RotationPlayer[]
): boolean {
  return winners.some(
    (player) =>
      (player.consecutiveGames ?? 1) >=
      MAX_CONSECUTIVE_GAMES
  );
}

/**
 * Build the next game.
 *
 * SMART 2-ON / 2-OFF:
 *
 * Winners stay and split.
 * First two queue players enter.
 *
 * If winners already played 2 consecutive games,
 * all four players rotate off.
 */
export function getSmartNextCourt(
  queuePlayers: QueuePlayer[],
  currentCourt: RotationPlayer[],
  winnerIds: string[]
): {
  nextCourt: RotationPlayer[];
  incomingPlayers: QueuePlayer[];
  losingPlayers: RotationPlayer[];
  rotateAll: boolean;
} {
  const court = sanitizePlayers(
    currentCourt
  ) as RotationPlayer[];

  const queue = sanitizePlayers(queuePlayers);

  if (court.length !== COURT_SIZE) {
    throw new Error(
      "Current court must contain exactly 4 valid players."
    );
  }

  if (winnerIds.length !== TEAM_SIZE) {
    throw new Error(
      "Exactly 2 winners are required."
    );
  }

  const winners = getWinningTeam(
    court,
    winnerIds
  );

  const losers = getLosingTeam(
    court,
    winnerIds
  );

  if (winners.length !== 2) {
    throw new Error(
      "The selected winners do not match the current court."
    );
  }

  if (losers.length !== 2) {
    throw new Error(
      "The losing team could not be determined."
    );
  }

  /*
   * Remove anybody currently on court from
   * the waiting queue.
   */
  const waitingPlayers = queue.filter(
    (queuePlayer) =>
      !court.some(
        (courtPlayer) =>
          courtPlayer.id === queuePlayer.id
      )
  );

  /*
   * Winners have reached the maximum.
   *
   * Everybody leaves.
   */
  const rotateAll = mustRotateWinnerTeam(
    winners
  );

  if (rotateAll) {
    if (waitingPlayers.length < 4) {
      throw new Error(
        "The winners have reached the 2-game limit. At least 4 waiting players are required for the next game."
      );
    }

    const incomingPlayers =
      waitingPlayers.slice(0, 4);

    const nextCourt =
      incomingPlayers.map((player) => ({
        ...player,
        consecutiveGames: 1,
      }));

    return {
      nextCourt,
      incomingPlayers,
      losingPlayers: court,
      rotateAll: true,
    };
  }

  /*
   * Normal 2-on / 2-off rotation.
   */
  if (waitingPlayers.length < 2) {
    throw new Error(
      "At least 2 waiting players are required for the next game."
    );
  }

  const incomingPlayers =
    waitingPlayers.slice(0, 2);

  /*
   * Winners stay but split.
   *
   * Each winner now has one more
   * consecutive game.
   */
  const nextWinners = winners.map(
    (player) => ({
      ...player,
      consecutiveGames:
        (player.consecutiveGames ?? 1) + 1,
    })
  );

  /*
   * Winners occupy positions 1 and 2.
   * Incoming players occupy positions 3 and 4.
   *
   * The UI should treat positions 1 & 3
   * as Team A and positions 2 & 4
   * as Team B.
   */
  const nextCourt: RotationPlayer[] = [
    nextWinners[0],
    nextWinners[1],
    {
      ...incomingPlayers[0],
      consecutiveGames: 1,
    },
    {
      ...incomingPlayers[1],
      consecutiveGames: 1,
    },
  ];

  return {
    nextCourt,
    incomingPlayers,
    losingPlayers: losers,
    rotateAll: false,
  };
}

/**
 * Future 4-on / 4-off mode.
 */
export function getFourOnFourOffCourt(
  queuePlayers: QueuePlayer[]
): RotationPlayer[] {
  const validQueue =
    sanitizePlayers(queuePlayers);

  if (validQueue.length < 4) {
    return [];
  }

  return validQueue
    .slice(0, 4)
    .map((player) => ({
      ...player,
      consecutiveGames: 1,
    }));
}