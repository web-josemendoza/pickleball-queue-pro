import { describe, expect, it } from "vitest";

import {
  findAlerts,
  findTournamentAlerts,
  type SessionSnapshot,
  type TournamentSnapshot,
} from "./alerts";

const p = (id: string) => ({ id, name: id.toUpperCase() });

function session(
  courts: [number, "playing" | "completed", string[]][],
  waiting: string[],
  onBreakIds: string[] = [],
  status = "active"
): SessionSnapshot {
  return {
    status,
    courts: courts.map(([courtNumber, courtStatus, ids]) => ({
      courtNumber,
      status: courtStatus,
      players: ids.map(p),
    })),
    waitingPlayers: waiting.map(p),
    onBreakIds,
  };
}

const summary = (before: SessionSnapshot, after: SessionSnapshot) =>
  findAlerts(before, after).map((a) => `${a.playerId}:${a.kind}`).sort();

describe("findTournamentAlerts", () => {
  const teams = {
    t1: { name: "Ben & Dan", members: [{ name: "Ben", playerId: "ben" }, { name: "Dan", playerId: "dan" }] },
    t2: { name: "Cara & Kim", members: [{ name: "Cara", playerId: "cara" }, { name: "Kim" }] },
  };

  it("alerts registered players on both teams when a match is called", () => {
    const before: TournamentSnapshot = {
      teams,
      matches: { m1: { stage: "pool", pool: 1, status: "waiting", teamA: "t1", teamB: "t2" } },
    };
    const after: TournamentSnapshot = {
      teams,
      matches: { m1: { stage: "pool", pool: 1, status: "playing", court: 3, teamA: "t1", teamB: "t2" } },
    };

    const alerts = findTournamentAlerts(before, after);

    // Kim is a guest: no account, no alert.
    expect(alerts.map((a) => a.playerId).sort()).toEqual(["ben", "cara", "dan"]);
    expect(alerts[0].title).toBe("Your match is on Court 3!");
    expect(alerts.find((a) => a.playerId === "ben")!.body).toContain("Pool B vs Cara & Kim");
  });

  it("names the final and doesn't repeat alerts for a match already on court", () => {
    const playing: TournamentSnapshot = {
      teams,
      matches: {
        s1: { stage: "playoff", round: 1, status: "done", teamA: "t1", teamB: "t2" },
        f: { stage: "playoff", round: 2, status: "playing", court: 1, teamA: "t1", teamB: "t2" },
      },
    };

    expect(findTournamentAlerts(null, playing)[0].body).toContain("Final vs");
    expect(findTournamentAlerts(playing, playing)).toEqual([]);
  });
});

describe("findAlerts", () => {
  it("alerts players when a new game puts them on a court", () => {
    const before = session(
      [[1, "completed", ["a", "b", "c", "d"]]],
      ["e", "f", "g", "h", "i"]
    );
    const after = session(
      [[1, "playing", ["e", "f", "a", "b"]]],
      ["g", "h", "i", "c", "d"]
    );

    // e, f, a, b go on court. The new top four waiting
    // are g, h, i, c: g and h were already up next.
    expect(summary(before, after)).toEqual([
      "a:court",
      "b:court",
      "c:upNext",
      "e:court",
      "f:court",
      "i:upNext",
    ]);
  });

  it("does not repeat alerts when nothing changed for a player", () => {
    const state = session(
      [[1, "playing", ["a", "b", "c", "d"]]],
      ["e", "f", "g", "h", "i"]
    );

    expect(findAlerts(state, state)).toEqual([]);
  });

  it("only counts the first four ready players as up next", () => {
    const before = session([[1, "playing", ["a", "b", "c", "d"]]], []);
    const after = session(
      [[1, "playing", ["a", "b", "c", "d"]]],
      ["e", "f", "g", "h", "i"]
    );

    expect(summary(before, after)).toEqual([
      "e:upNext",
      "f:upNext",
      "g:upNext",
      "h:upNext",
    ]);
  });

  it("skips players on a break and alerts whoever moves up instead", () => {
    const before = session(
      [[1, "playing", ["a", "b", "c", "d"]]],
      ["e", "f", "g", "h", "i"]
    );
    const after = session(
      [[1, "playing", ["a", "b", "c", "d"]]],
      ["e", "f", "g", "h", "i"],
      ["e"]
    );

    expect(summary(before, after)).toEqual(["i:upNext"]);
  });

  it("sends nothing when the session is not active", () => {
    const before = session([[1, "playing", ["a", "b", "c", "d"]]], ["e"]);
    const after = session(
      [[1, "playing", ["a", "b", "c", "d"]]],
      ["e"],
      [],
      "finished"
    );

    expect(findAlerts(before, after)).toEqual([]);
    expect(findAlerts(null, null)).toEqual([]);
  });

  it("alerts everyone on court when a session starts", () => {
    const after = session(
      [[1, "playing", ["a", "b", "c", "d"]]],
      ["e"]
    );

    expect(summary(null, after)).toEqual([
      "a:court",
      "b:court",
      "c:court",
      "d:court",
      "e:upNext",
    ]);
  });
});
