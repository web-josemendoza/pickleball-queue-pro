import { describe, expect, it } from "vitest";

import type { CourtState, OpenPlayState } from "./game";
import {
  describeRange,
  periodRange,
  startOfWeek,
  statsForRange,
} from "./periodStats";

const player = (id: string) => ({
  id,
  name: id.toUpperCase(),
  joinedAt: 0,
  skillLevel: 3.0 as const,
});

// a & b beat c & d unless flipped.
function game(at: Date, scoreA = 11, scoreB = 5): CourtState {
  const aWins = scoreA > scoreB;
  return {
    courtNumber: 1,
    players: ["a", "b", "c", "d"].map(player),
    status: "completed",
    startedAt: at.getTime() - 60_000,
    completedAt: at.getTime(),
    scoreA,
    scoreB,
    winnerIds: aWins ? ["a", "b"] : ["c", "d"],
    loserIds: aWins ? ["c", "d"] : ["a", "b"],
  };
}

function session(id: string, games: CourtState[]): OpenPlayState {
  return {
    sessionId: id,
    cycles: games.map((court, i) => ({
      cycleNumber: i + 1,
      startedAt: 0,
      completedAt: null,
      courts: [court],
    })),
  } as unknown as OpenPlayState;
}

// Wednesday 1 Oct 2026, 7pm local time.
const wednesday = new Date(2026, 9, 1, 19, 0);

describe("periods", () => {
  it("weeks run Monday to Sunday", () => {
    expect(startOfWeek(wednesday)).toEqual(new Date(2026, 8, 28));
    // Sunday belongs to the week that started the Monday before.
    expect(startOfWeek(new Date(2026, 9, 4, 22))).toEqual(new Date(2026, 8, 28));
    // Monday starts a new week.
    expect(startOfWeek(new Date(2026, 9, 5, 8))).toEqual(new Date(2026, 9, 5));
  });

  it("a day is local midnight to midnight", () => {
    const { from, to } = periodRange("day", wednesday);
    expect(from).toEqual(new Date(2026, 9, 1));
    expect(to).toEqual(new Date(2026, 9, 2));
  });

  it("describes the range for the heading", () => {
    expect(describeRange("week", wednesday)).toMatch(/28.*4/);
  });
});

describe("statsForRange", () => {
  const monday = new Date(2026, 8, 28, 18);
  const lastSunday = new Date(2026, 8, 27, 18);
  const tuesdayLate = new Date(2026, 8, 30, 23, 59);

  const sessions = [
    session("mon", [game(monday), game(monday, 4, 11)]),
    session("oldweek", [game(lastSunday)]),
    session("tue", [game(tuesdayLate)]),
    session("today", [game(wednesday), game(wednesday)]),
  ];

  it("adds up every session in the week", () => {
    const { from, to } = periodRange("week", wednesday);
    const rows = statsForRange(sessions, from, to);
    const a = rows.find((r) => r.playerId === "a")!;

    // Mon: 1W 1L, Tue: 1W, Wed: 2W. Last Sunday excluded.
    expect(a).toMatchObject({ gamesPlayed: 5, wins: 4, losses: 1 });
    expect(a.pointsFor).toBe(11 + 4 + 11 + 11 + 11);
    expect(rows[0].playerId === "a" || rows[0].playerId === "b").toBe(true);
  });

  it("counts only today's games for the day", () => {
    const { from, to } = periodRange("day", wednesday);
    const c = statsForRange(sessions, from, to).find((r) => r.playerId === "c")!;

    // A game at 11:59pm Tuesday stays on Tuesday.
    expect(c).toMatchObject({ gamesPlayed: 2, wins: 0, losses: 2 });
  });

  it("counts the live session once even if it's also in history", () => {
    const { from, to } = periodRange("day", wednesday);
    const rows = statsForRange([...sessions, sessions[3]], from, to);

    expect(rows.find((r) => r.playerId === "a")!.gamesPlayed).toBe(2);
  });

  it("returns nothing when no games were played", () => {
    const rows = statsForRange(sessions, new Date(2030, 0, 1), new Date(2030, 0, 2));
    expect(rows).toEqual([]);
  });
});
