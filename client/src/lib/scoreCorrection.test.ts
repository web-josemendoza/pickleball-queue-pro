import { describe, expect, it } from "vitest";

import type {
  CourtState,
  OpenPlayState,
} from "./game";
import { applyScoreCorrection } from "./scoreCorrection";

const player = (id: string) => ({
  id,
  name: id,
  joinedAt: 0,
  skillLevel: 3.0 as const,
});

const stats = (
  id: string,
  wins: number,
  losses: number,
  pointsFor: number,
  pointsAgainst: number
) => ({
  playerId: id,
  name: id,
  gamesPlayed: wins + losses,
  wins,
  losses,
  pointsFor,
  pointsAgainst,
});

// a & b beat c & d 11-5; entered wrong, should be 9-11.
const wrongGame: CourtState = {
  courtNumber: 1,
  players: ["a", "b", "c", "d"].map(player),
  status: "completed",
  startedAt: 100,
  completedAt: 200,
  scoreA: 11,
  scoreB: 5,
  winnerIds: ["a", "b"],
  loserIds: ["c", "d"],
};

const otherGame: CourtState = {
  ...wrongGame,
  courtNumber: 2,
  startedAt: 150,
};

const state = {
  cycles: [
    { cycleNumber: 1, startedAt: 100, completedAt: 200, courts: [wrongGame] },
    { cycleNumber: 2, startedAt: 150, completedAt: 250, courts: [otherGame] },
  ],
  courts: [wrongGame, otherGame],
  playerStats: {
    // Each player's stats include both games.
    a: stats("a", 2, 0, 22, 10),
    b: stats("b", 2, 0, 22, 10),
    c: stats("c", 0, 2, 10, 22),
    d: stats("d", 0, 2, 10, 22),
  },
} as unknown as OpenPlayState;

describe("applyScoreCorrection", () => {
  const fixed = applyScoreCorrection(
    state,
    1,
    100,
    9,
    11
  );

  it("flips the winner and updates the game", () => {
    const game = fixed.cycles[0].courts[0];

    expect(game.scoreA).toBe(9);
    expect(game.scoreB).toBe(11);
    expect(game.winnerIds).toEqual(["c", "d"]);
    expect(game.loserIds).toEqual(["a", "b"]);
    expect(fixed.courts[0].scoreA).toBe(9);
  });

  it("moves wins, losses and points to match", () => {
    // a: was 2-0, 22-10. Remove 11-5 win, add 9-11 loss.
    expect(fixed.playerStats.a).toMatchObject({
      gamesPlayed: 2,
      wins: 1,
      losses: 1,
      pointsFor: 22 - 11 + 9,
      pointsAgainst: 10 - 5 + 11,
    });

    expect(fixed.playerStats.c).toMatchObject({
      gamesPlayed: 2,
      wins: 1,
      losses: 1,
      pointsFor: 10 - 5 + 11,
      pointsAgainst: 22 - 11 + 9,
    });
  });

  it("leaves other games alone", () => {
    expect(fixed.cycles[1].courts[0]).toEqual(otherGame);
    expect(fixed.courts[1]).toEqual(otherGame);
  });

  it("does not change the original session object", () => {
    expect(state.cycles[0].courts[0].scoreA).toBe(11);
    expect(state.playerStats.a.wins).toBe(2);
  });

  it("rejects ties and unknown games", () => {
    expect(() =>
      applyScoreCorrection(state, 1, 100, 7, 7)
    ).toThrow("tie");

    expect(() =>
      applyScoreCorrection(state, 3, 100, 11, 7)
    ).toThrow("could not be found");
  });
});
