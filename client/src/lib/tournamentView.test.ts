import { describe, expect, it } from "vitest";

import {
  DEFAULT_SETTINGS,
  matchList,
  recordResult,
  startTournament,
  type Tournament,
} from "./tournament";
import {
  formatPreview,
  matchLabel,
  nextMatchFor,
  roundName,
  teamOfPlayer,
} from "./tournamentView";

function tournament(teamCount: number, courtCount: number): Tournament {
  const teams = Object.fromEntries(
    Array.from({ length: teamCount }, (_, i) => [
      `t${i + 1}`,
      {
        id: `t${i + 1}`,
        name: `Team ${i + 1}`,
        members: [
          { name: `A${i + 1}`, playerId: `u${i + 1}` },
          { name: `Guest ${i + 1}` },
        ],
        seed: i + 1,
      },
    ])
  );

  return {
    id: "t",
    name: "Test",
    status: "setup",
    settings: { ...DEFAULT_SETTINGS, courtCount },
    teams,
    pools: [],
    matches: {},
    championId: null,
    createdAt: 0,
  };
}

describe("tournament view helpers", () => {
  it("names playoff rounds from the end", () => {
    expect(roundName(3, 3)).toBe("Final");
    expect(roundName(2, 3)).toBe("Semifinal");
    expect(roundName(1, 3)).toBe("Quarterfinal");
    expect(roundName(1, 4)).toBe("Round 1");
  });

  it("labels pool matches with pool letter and round", () => {
    const t = startTournament(tournament(8, 2), 0);
    const first = matchList(t)[0];
    expect(matchLabel(t, first)).toBe("Pool A · Round 1");
  });

  it("finds a registered player's team, not a guest's", () => {
    const t = tournament(4, 1);
    expect(teamOfPlayer(t, "u3")).toBe("t3");
    expect(teamOfPlayer(t, "nobody")).toBeNull();
    expect(teamOfPlayer(t, null)).toBeNull();
  });

  it("tells a team whether they're playing, up next or waiting", () => {
    const t = startTournament(tournament(8, 1), 0);
    const playing = matchList(t).find((m) => m.status === "playing")!;

    expect(nextMatchFor(t, playing.teamA!).kind).toBe("playing");

    const kinds = Object.keys(t.teams).map((id) => nextMatchFor(t, id).kind);
    expect(kinds).toContain("upNext");
  });

  it("reports the champion and eliminated teams at the end", () => {
    let t = startTournament(tournament(4, 1), 0);
    let clock = 0;

    while (t.status !== "finished") {
      const m = matchList(t).find((x) => x.status === "playing")!;
      const aBetter = t.teams[m.teamA!].seed < t.teams[m.teamB!].seed;
      t = recordResult(t, m.id, aBetter ? 11 : 4, aBetter ? 4 : 11, ++clock);
    }

    expect(nextMatchFor(t, "t1").kind).toBe("champion");
    expect(nextMatchFor(t, "t4").kind).toBe("eliminated");
  });

  it("previews the plan for the setup screen", () => {
    // 16 teams in 4 pools of 4, top 2 advance.
    expect(formatPreview(16, 4, 2)).toEqual({
      poolMatches: 24,
      qualifiers: 8,
      playoffMatches: 7,
    });
  });
});
