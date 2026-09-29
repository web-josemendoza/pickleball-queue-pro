import { describe, expect, it } from "vitest";

import type {
  CourtState,
  OpenPlayState,
} from "./game";
import { getPlayerHistory } from "./playerHistory";

const player = (id: string) => ({
  id,
  name: id.toUpperCase(),
  joinedAt: 0,
  skillLevel: 3.0 as const,
});

function game(
  ids: [string, string, string, string],
  scoreA: number,
  scoreB: number,
  completedAt: number,
  status: CourtState["status"] = "completed"
): CourtState {
  return {
    courtNumber: 1,
    players: ids.map(player),
    status,
    startedAt: completedAt - 1,
    completedAt,
    scoreA,
    scoreB,
    winnerIds: [],
    loserIds: [],
  };
}

function session(
  sessionId: string,
  games: CourtState[]
): OpenPlayState {
  return {
    sessionId,
    cycles: games.map((court, index) => ({
      cycleNumber: index + 1,
      startedAt: 0,
      completedAt: null,
      courts: [court],
    })),
    // The live courts array mirrors cycles and
    // must not be double counted.
    courts: games,
  } as unknown as OpenPlayState;
}

describe("getPlayerHistory", () => {
  const sessions = [
    session("s1", [
      game(["a", "b", "c", "d"], 11, 5, 100),
      game(["c", "a", "b", "d"], 8, 11, 200),
    ]),
    session("s2", [
      game(["b", "c", "a", "b2"], 11, 9, 300),
      // Still being played: ignored.
      game(["a", "b", "c", "d"], 0, 0, 400, "playing"),
    ]),
    session("s3", [
      game(["c", "d", "e", "f"], 11, 2, 500),
    ]),
  ];

  const history = getPlayerHistory("a", sessions);

  it("counts each completed game once", () => {
    expect(history.games).toBe(3);
    expect(history.wins).toBe(1);
    expect(history.losses).toBe(2);
    expect(history.sessions).toBe(2);
  });

  it("totals points from the player's side", () => {
    // 11-5 (A side), 8-11 (A side), 9-11 (B side)
    expect(history.pointsFor).toBe(11 + 8 + 9);
    expect(history.pointsAgainst).toBe(5 + 11 + 11);
  });

  it("ranks partners by games together", () => {
    expect(history.topPartners[0]).toMatchObject({
      playerId: "b",
      games: 1,
    });
    expect(
      history.topPartners.map((p) => p.playerId).sort()
    ).toEqual(["b", "b2", "c"]);
  });

  it("lists recent games newest first", () => {
    expect(
      history.recentGames.map((g) => g.completedAt)
    ).toEqual([300, 200, 100]);
  });

  it("returns empty stats for a player with no games", () => {
    const empty = getPlayerHistory("zzz", sessions);

    expect(empty.games).toBe(0);
    expect(empty.winRate).toBe(0);
  });
});
