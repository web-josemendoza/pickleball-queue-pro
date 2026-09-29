import type { QueuePlayer } from "./queue";

/**
 * Player statistics during an Open Play session.
 */
export interface PlayerPool {
  playerId: string;
  name: string;

  gamesPlayed: number;
  wins: number;
  losses: number;

  pointsFor: number;
  pointsAgainst: number;

  winRate: number;
  pointDifferential: number;
}

/**
 * Create an empty statistics record for a player.
 */
export function createPlayerPool(
  player: QueuePlayer
): PlayerPool {
  return {
    playerId: player.id,
    name: player.name,

    gamesPlayed: 0,
    wins: 0,
    losses: 0,

    pointsFor: 0,
    pointsAgainst: 0,

    winRate: 0,
    pointDifferential: 0,
  };
}

/**
 * Build player statistics from completed game history.
 *
 * Each game has:
 *   Team A = courtPlayers[0] + courtPlayers[1]
 *   Team B = courtPlayers[2] + courtPlayers[3]
 */
export function buildPlayerPools(
  players: QueuePlayer[],
  history: Array<{
    courtPlayers: QueuePlayer[];
    winnerIds: string[];
    teamAScore?: number;
    teamBScore?: number;
  }>
): Record<string, PlayerPool> {
  const result: Record<string, PlayerPool> = {};

  // --------------------------------------------------
  // INITIALIZE ALL PLAYERS
  // --------------------------------------------------

  players.forEach((player) => {
    result[player.id] = createPlayerPool(player);
  });

  // --------------------------------------------------
  // PROCESS COMPLETED GAMES
  // --------------------------------------------------

  history.forEach((game) => {
    const courtPlayers = game.courtPlayers;

    if (courtPlayers.length !== 4) {
      return;
    }

    const teamA = courtPlayers.slice(0, 2);
    const teamB = courtPlayers.slice(2, 4);

    const scoreA =
      typeof game.teamAScore === "number"
        ? game.teamAScore
        : 0;

    const scoreB =
      typeof game.teamBScore === "number"
        ? game.teamBScore
        : 0;

    const winnerIds = game.winnerIds ?? [];

    // ------------------------------------------------
    // TEAM A
    // ------------------------------------------------

    teamA.forEach((player) => {
      if (!result[player.id]) {
        result[player.id] = createPlayerPool(player);
      }

      const pool = result[player.id];

      pool.gamesPlayed += 1;

      pool.pointsFor += scoreA;
      pool.pointsAgainst += scoreB;

      if (winnerIds.includes(player.id)) {
        pool.wins += 1;
      } else {
        pool.losses += 1;
      }
    });

    // ------------------------------------------------
    // TEAM B
    // ------------------------------------------------

    teamB.forEach((player) => {
      if (!result[player.id]) {
        result[player.id] = createPlayerPool(player);
      }

      const pool = result[player.id];

      pool.gamesPlayed += 1;

      pool.pointsFor += scoreB;
      pool.pointsAgainst += scoreA;

      if (winnerIds.includes(player.id)) {
        pool.wins += 1;
      } else {
        pool.losses += 1;
      }
    });
  });

  // --------------------------------------------------
  // CALCULATE FINAL STATISTICS
  // --------------------------------------------------

  Object.values(result).forEach((pool) => {
    pool.winRate =
      pool.gamesPlayed > 0
        ? pool.wins / pool.gamesPlayed
        : 0;

    pool.pointDifferential =
      pool.pointsFor - pool.pointsAgainst;
  });

  return result;
}

/**
 * Return players ranked from best to worst.
 *
 * Ranking priority:
 *
 * 1. Most wins
 * 2. Highest win rate
 * 3. Highest point differential
 * 4. Most games played
 * 5. Player name
 */
export function getRankedPlayers(
  players: QueuePlayer[],
  history: Array<{
    courtPlayers: QueuePlayer[];
    winnerIds: string[];
    teamAScore?: number;
    teamBScore?: number;
  }>
): PlayerPool[] {
  const pools = buildPlayerPools(
    players,
    history
  );

  return Object.values(pools).sort(
    (a, b) => {
      // 1. Wins
      if (b.wins !== a.wins) {
        return b.wins - a.wins;
      }

      // 2. Win rate
      if (b.winRate !== a.winRate) {
        return b.winRate - a.winRate;
      }

      // 3. Point differential
      if (
        b.pointDifferential !==
        a.pointDifferential
      ) {
        return (
          b.pointDifferential -
          a.pointDifferential
        );
      }

      // 4. Games played
      if (
        b.gamesPlayed !==
        a.gamesPlayed
      ) {
        return (
          b.gamesPlayed -
          a.gamesPlayed
        );
      }

      // 5. Alphabetical
      return a.name.localeCompare(b.name);
    }
  );
}

/**
 * Get one player's statistics.
 */
export function getPlayerStats(
  playerId: string,
  players: QueuePlayer[],
  history: Array<{
    courtPlayers: QueuePlayer[];
    winnerIds: string[];
    teamAScore?: number;
    teamBScore?: number;
  }>
): PlayerPool | null {
  const rankedPlayers =
    getRankedPlayers(
      players,
      history
    );

  return (
    rankedPlayers.find(
      (player) =>
        player.playerId === playerId
    ) ?? null
  );
}