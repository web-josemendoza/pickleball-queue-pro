import { describe, expect, it } from "vitest";

import {
  bracketOrder,
  correctResult,
  DEFAULT_SETTINGS,
  makePlayoffMatches,
  makePools,
  matchList,
  normalizeTournament,
  poolStandings,
  readyMatches,
  recordResult,
  roundRobinRounds,
  startTournament,
  type Tournament,
  type TournamentSettings,
} from "./tournament";

// ------------------------------------------------------
// HELPERS
// ------------------------------------------------------

function makeTournament(
  teamCount: number,
  settings: Partial<TournamentSettings> = {}
): Tournament {
  const teams = Object.fromEntries(
    Array.from({ length: teamCount }, (_, i) => [
      `t${i + 1}`,
      {
        id: `t${i + 1}`,
        name: `Team ${i + 1}`,
        members: [{ name: `A${i + 1}` }, { name: `B${i + 1}` }],
        seed: i + 1,
      },
    ])
  );

  return {
    id: "test",
    name: "Test Open",
    status: "setup",
    settings: { ...DEFAULT_SETTINGS, ...settings },
    teams,
    pools: [],
    matches: {},
    championId: null,
    createdAt: 0,
  };
}

const seedOf = (t: Tournament, id: string | null) =>
  id ? t.teams[id].seed : 999;

type Winner = (t: Tournament, teamA: string, teamB: string) => "A" | "B";

// The better seed always wins, 11-5.
const favouriteWins: Winner = (t, a, b) =>
  seedOf(t, a) < seedOf(t, b) ? "A" : "B";

/*
 * Plays a whole tournament: courts finish one at a time,
 * oldest game first. Checks the queue invariants after
 * every step and returns the history.
 */
function playOut(t0: Tournament, winner: Winner = favouriteWins) {
  let clock = 1000;
  let t = startTournament(t0, clock);
  const starts: { matchId: string; at: number }[] = [];
  let backToBackWhileOthersReady = 0;
  let safety = 0;

  const record = (state: Tournament) => {
    for (const m of matchList(state)) {
      if (m.status === "playing" && !starts.some((s) => s.matchId === m.id)) {
        starts.push({ matchId: m.id, at: m.startedAt! });
      }
    }
  };

  const checkInvariants = (state: Tournament) => {
    const playing = matchList(state).filter((m) => m.status === "playing");
    const courts = playing.map((m) => m.court);
    const teams = playing.flatMap((m) => [m.teamA, m.teamB]);

    expect(new Set(courts).size).toBe(courts.length);
    expect(new Set(teams).size).toBe(teams.length);
    expect(courts.every((c) => c! >= 1 && c! <= state.settings.courtCount)).toBe(true);
  };

  record(t);
  checkInvariants(t);

  while (t.status !== "finished") {
    if (++safety > 500) throw new Error("tournament never finished");

    const playing = matchList(t)
      .filter((m) => m.status === "playing")
      .sort((a, b) => a.startedAt! - b.startedAt! || a.court! - b.court!);

    expect(playing.length).toBeGreaterThan(0);

    const m = playing[0];
    clock += 60_000;
    const aWins = winner(t, m.teamA!, m.teamB!) === "A";

    // What else could have gone on this court instead.
    const finishedTeams = [m.teamA!, m.teamB!];

    t = recordResult(t, m.id, aWins ? 11 : 5, aWins ? 5 : 11, clock);
    record(t);
    checkInvariants(t);

    const newlyStarted = matchList(t).filter(
      (x) => x.status === "playing" && x.startedAt === clock
    );

    for (const started of newlyStarted) {
      const involvesJustFinished = finishedTeams.some(
        (id) => id === started.teamA || id === started.teamB
      );

      if (!involvesJustFinished) continue;

      // Was there a ready match for this court without them?
      const before = structuredClone(t);
      before.matches[started.id].status = "waiting";
      before.matches[started.id].court = null;
      const alternatives = readyMatches(before).filter(
        (x) =>
          x.id !== started.id &&
          !finishedTeams.includes(x.teamA!) &&
          !finishedTeams.includes(x.teamB!)
      );

      if (alternatives.length > 0) {
        backToBackWhileOthersReady += 1;
      }
    }
  }

  return { t, starts, backToBackWhileOthersReady };
}

// ------------------------------------------------------
// TESTS
// ------------------------------------------------------

describe("pools", () => {
  it("snakes seeds across pools so top teams are spread out", () => {
    const ids = Array.from({ length: 16 }, (_, i) => `t${i + 1}`);
    const pools = makePools(ids, 4);

    expect(pools).toEqual([
      ["t1", "t8", "t9", "t16"],
      ["t2", "t7", "t10", "t15"],
      ["t3", "t6", "t11", "t14"],
      ["t4", "t5", "t12", "t13"],
    ]);
  });

  it("keeps pools within one team of each other", () => {
    const sizes = makePools(
      Array.from({ length: 10 }, (_, i) => `t${i}`),
      4
    ).map((p) => p.length);

    expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1);
    expect(sizes.reduce((a, b) => a + b, 0)).toBe(10);
  });

  it("round robin: every pair meets once, one match per team per round", () => {
    for (const n of [3, 4, 5, 6]) {
      const ids = Array.from({ length: n }, (_, i) => `t${i}`);
      const rounds = roundRobinRounds(ids);
      const pairs = rounds.flat().map(([a, b]) => [a, b].sort().join("-"));

      expect(new Set(pairs).size).toBe((n * (n - 1)) / 2);
      expect(pairs.length).toBe((n * (n - 1)) / 2);

      for (const round of rounds) {
        const teams = round.flat();
        expect(new Set(teams).size).toBe(teams.length);
      }
    }
  });
});

describe("standings", () => {
  it("breaks a two-way tie on head-to-head, then point difference", () => {
    const t = startTournament(makeTournament(3, { poolSize: 3, courtCount: 1 }), 0);
    const results: Record<string, [number, number]> = {};

    // t1 beats t2, t2 beats t3, t3 beats t1: all 1-1.
    // Differentials decide: make t3 the biggest winner.
    for (const m of matchList(t)) {
      const key = [m.teamA, m.teamB].sort().join("-");
      results[key] =
        key === "t1-t2" ? (m.teamA === "t1" ? [11, 9] : [9, 11])
        : key === "t2-t3" ? (m.teamA === "t2" ? [11, 9] : [9, 11])
        : m.teamA === "t3" ? [11, 1] : [1, 11];
    }

    let state = t;
    let clock = 0;

    while (state.status === "pools") {
      const m = matchList(state).find((x) => x.status === "playing")!;
      const key = [m.teamA, m.teamB].sort().join("-");
      state = recordResult(state, m.id, ...results[key], ++clock);
    }

    // Pool finished before playoffs replaced the state:
    const table = poolStandings(state, 0).map((r) => r.teamId);
    expect(table[0]).toBe("t3");
  });
});

describe("bracket", () => {
  it("orders seeds so 1 and 2 can only meet in the final", () => {
    expect(bracketOrder(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6]);
  });

  it("gives top seeds byes when qualifiers aren't a power of two", () => {
    const first = makePlayoffMatches(
      ["s1", "s2", "s3", "s4", "s5", "s6"],
      0
    ).filter((m) => m.round === 1);

    const pairs = first.map((m) => [m.teamA, m.teamB]);
    expect(pairs).toEqual([
      ["s1", null],
      ["s4", "s5"],
      ["s2", null],
      ["s3", "s6"],
    ]);
  });
});

describe("full tournaments", () => {
  it("16 teams, 4 courts: pools, playoff of 8, favourite wins", () => {
    const { t, backToBackWhileOthersReady } = playOut(makeTournament(16));

    const pool = matchList(t).filter((m) => m.stage === "pool");
    const playoff = matchList(t).filter((m) => m.stage === "playoff");

    expect(t.pools).toHaveLength(4);
    expect(pool).toHaveLength(24);
    expect(playoff).toHaveLength(7);
    expect(t.status).toBe("finished");
    expect(t.championId).toBe("t1");
    expect(backToBackWhileOthersReady).toBe(0);

    // Each team played 3 pool matches.
    for (const id of Object.keys(t.teams)) {
      const count = pool.filter((m) => m.teamA === id || m.teamB === id).length;
      expect(count).toBe(3);
    }
  });

  it("10 teams (uneven pools) with byes in the playoff", () => {
    const { t, backToBackWhileOthersReady } = playOut(
      makeTournament(10, { courtCount: 3 })
    );

    expect(t.status).toBe("finished");
    expect(t.championId).toBe("t1");
    expect(backToBackWhileOthersReady).toBe(0);
    expect(matchList(t).some((m) => m.bye)).toBe(true);
    // Byes never took a court.
    expect(matchList(t).filter((m) => m.bye).every((m) => m.court === null)).toBe(true);
  });

  it("never makes a team play back to back while another match is ready", () => {
    // Layouts where a plain schedule order would do it.
    const layouts: [number, number, number][] = [
      [5, 1, 5],
      [6, 2, 5],
      [7, 2, 6],
      [8, 3, 6],
      [9, 3, 4],
      [10, 3, 5],
    ];

    for (const [teams, courtCount, poolSize] of layouts) {
      const { backToBackWhileOthersReady } = playOut(
        makeTournament(teams, { courtCount, poolSize })
      );

      expect(
        backToBackWhileOthersReady,
        `${teams} teams, ${courtCount} courts, pools of ${poolSize}`
      ).toBe(0);
    }
  });

  it("one pool of 5 with top 2 advancing goes straight to a final", () => {
    const { t } = playOut(makeTournament(5, { poolSize: 5, courtCount: 2 }));
    const playoff = matchList(t).filter((m) => m.stage === "playoff");

    expect(playoff).toHaveLength(1);
    expect(t.championId).toBe("t1");
  });

  it("an upset changes who advances", () => {
    // Seed 16 beats everyone in its pool.
    const { t } = playOut(makeTournament(16), (state, a, b) =>
      a === "t16" ? "A" : b === "t16" ? "B" : favouriteWins(state, a, b)
    );

    const firstRound = matchList(t).filter(
      (m) => m.stage === "playoff" && m.round === 1
    );
    const inPlayoff = firstRound.flatMap((m) => [m.teamA, m.teamB]);

    expect(inPlayoff).toContain("t16");
  });
});

describe("saving to Firebase", () => {
  // Firebase drops null fields and empty lists on save.
  function firebaseRoundTrip(t: Tournament): unknown {
    const strip = (value: unknown): unknown => {
      if (Array.isArray(value)) {
        const items = value.map(strip);
        return items.length === 0 ? undefined : items;
      }

      if (value && typeof value === "object") {
        const entries = Object.entries(value)
          .map(([k, v]) => [k, strip(v)] as const)
          .filter(([, v]) => v !== null && v !== undefined);
        return entries.length === 0 ? undefined : Object.fromEntries(entries);
      }

      return value;
    };

    return strip(JSON.parse(JSON.stringify(t)));
  }

  it("keeps working after a save and reload mid-tournament", () => {
    let t = startTournament(makeTournament(8, { courtCount: 2 }), 0);
    let clock = 0;

    while (t.status !== "finished") {
      // Every step goes through a save/load like the app.
      t = normalizeTournament(firebaseRoundTrip(t) as Tournament)!;
      const m = matchList(t).find((x) => x.status === "playing")!;
      t = recordResult(t, m.id, 11, 6, ++clock);
    }

    expect(t.championId).not.toBeNull();
    expect(normalizeTournament(null)).toBeNull();
  });
});

describe("corrections", () => {
  it("fixes a pool score and flips the winner", () => {
    let t = startTournament(makeTournament(4, { courtCount: 2 }), 0);
    const m = matchList(t).find((x) => x.status === "playing")!;
    t = recordResult(t, m.id, 11, 3, 1);

    t = correctResult(t, m.id, 4, 11);

    expect(t.matches[m.id].winner).toBe(m.teamB);
    expect(t.matches[m.id].scoreA).toBe(4);
  });

  it("locks pool results once the playoff has started", () => {
    const { t } = playOut(makeTournament(8, { courtCount: 2 }));
    const poolMatch = matchList(t).find((m) => m.stage === "pool")!;

    expect(() => correctResult(t, poolMatch.id, 0, 11)).toThrow("locked");
  });

  it("rejects ties and unplayed matches", () => {
    const t = startTournament(makeTournament(4, { courtCount: 1 }), 0);
    const waiting = matchList(t).find((m) => m.status === "waiting")!;
    const playing = matchList(t).find((m) => m.status === "playing")!;

    expect(() => recordResult(t, playing.id, 7, 7, 1)).toThrow("tie");
    expect(() => recordResult(t, waiting.id, 11, 3, 1)).toThrow("not being played");
  });
});
