import { describe, expect, it } from "vitest";

import { findAlerts, type SessionSnapshot } from "./alerts";

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
