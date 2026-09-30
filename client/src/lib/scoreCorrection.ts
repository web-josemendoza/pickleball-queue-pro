/*
 * Correcting the score of a game that was already
 * finished. Pure (no Firebase), so it can be tested.
 */

import { createGameResult } from "./fourOnFour";
import type {
  CourtState,
  OpenPlayState,
  PlayerStats,
} from "./game";

function isSameGame(
  court: CourtState,
  courtNumber: number,
  startedAt: number | null
): boolean {
  return (
    court.courtNumber === courtNumber &&
    court.startedAt === startedAt &&
    court.status === "completed"
  );
}

/*
 * Adds (sign = 1) or removes (sign = -1) one game's
 * effect on a player's stats. gamesPlayed is not
 * touched: the game still happened.
 */
function applyResult(
  stats: PlayerStats,
  court: CourtState,
  sign: 1 | -1
): PlayerStats {
  const onTeamA = court.players
    .slice(0, 2)
    .some((player) => player.id === stats.playerId);

  const scoreFor = onTeamA
    ? court.scoreA ?? 0
    : court.scoreB ?? 0;
  const scoreAgainst = onTeamA
    ? court.scoreB ?? 0
    : court.scoreA ?? 0;

  const won = court.winnerIds.includes(
    stats.playerId
  );
  const lost = court.loserIds.includes(
    stats.playerId
  );

  return {
    ...stats,
    wins: stats.wins + sign * (won ? 1 : 0),
    losses: stats.losses + sign * (lost ? 1 : 0),
    pointsFor: stats.pointsFor + sign * scoreFor,
    pointsAgainst:
      stats.pointsAgainst + sign * scoreAgainst,
  };
}

/*
 * Returns the session with one finished game's score
 * replaced and every player's wins, losses and points
 * updated to match. Who plays next is not changed:
 * that decision was already made.
 */
export function applyScoreCorrection(
  state: OpenPlayState,
  courtNumber: number,
  startedAt: number | null,
  scoreA: number,
  scoreB: number
): OpenPlayState {
  let original: CourtState | null = null;

  for (const cycle of state.cycles ?? []) {
    for (const court of cycle.courts ?? []) {
      if (
        isSameGame(court, courtNumber, startedAt)
      ) {
        original = court;
      }
    }
  }

  if (!original) {
    throw new Error(
      "That game could not be found. It may have been changed by someone else."
    );
  }

  const result = createGameResult(
    {
      courtNumber,
      players: original.players,
    },
    scoreA,
    scoreB,
    original.completedAt ?? undefined
  );

  const corrected: CourtState = {
    ...original,
    scoreA: result.scoreA,
    scoreB: result.scoreB,
    winnerIds: result.winnerIds,
    loserIds: result.loserIds,
  };

  const playerStats = { ...state.playerStats };

  for (const player of original.players) {
    const current = playerStats[player.id];

    if (!current) {
      continue;
    }

    playerStats[player.id] = applyResult(
      applyResult(current, original, -1),
      corrected,
      1
    );
  }

  const replace = (court: CourtState) =>
    isSameGame(court, courtNumber, startedAt)
      ? corrected
      : court;

  return {
    ...state,
    playerStats,
    courts: (state.courts ?? []).map(replace),
    cycles: (state.cycles ?? []).map((cycle) => ({
      ...cycle,
      courts: (cycle.courts ?? []).map(replace),
    })),
  };
}
