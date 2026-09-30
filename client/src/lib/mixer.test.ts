import { describe, expect, it } from "vitest";

import type {
  CourtState,
  FixedPair,
  OpenPlayState,
} from "./game";
import {
  buildMixRules,
  chooseBestTeamPairing,
  createPairedInitialCycle,
  planNextCourt,
} from "./mixer";
import type { QueuePlayer } from "./queue";
import type { SkillLevel } from "./player";

// ------------------------------------------------------
// TEST HELPERS
// ------------------------------------------------------

function makePlayers(
  count: number,
  skill: (index: number) => SkillLevel = () => 3.0
): QueuePlayer[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `p${i}`,
    name: `P${i}`,
    joinedAt: i,
    skillLevel: skill(i),
  }));
}

function playingCourt(
  courtNumber: number,
  players: QueuePlayer[],
  startedAt: number
): CourtState {
  return {
    courtNumber,
    players,
    status: "playing",
    startedAt,
    completedAt: null,
    scoreA: null,
    scoreB: null,
    winnerIds: [],
    loserIds: [],
  };
}

type SimOptions = {
  players: QueuePlayer[];
  courtCount: number;
  games: number;
  fixedPairs?: FixedPair[];
  keepApartPairs?: FixedPair[];
  skillBalance?: boolean;
  onBreakIds?: string[];
};

/*
 * Plays `games` games through the real rotation.
 * Courts finish in turn; team A wins every other
 * game. Returns every lineup that went on court.
 */
function simulate(options: SimOptions) {
  const {
    players,
    courtCount,
    games,
  } = options;

  const first = createPairedInitialCycle(
    players,
    courtCount,
    options.fixedPairs ?? []
  );

  let clock = 1000;

  const state: OpenPlayState = {
    sessionId: "test",
    status: "active",
    cycleNumber: 1,
    playerCount: players.length,
    courtCount,
    durationHours: 2,
    startedAt: clock,
    endsAt: null,
    players,
    waitingPlayers: first.waitingPlayers,
    courts: first.courts.map((court) =>
      playingCourt(
        court.courtNumber,
        court.players,
        clock
      )
    ),
    cycles: [],
    playerStats: Object.fromEntries(
      players.map((player) => [
        player.id,
        {
          playerId: player.id,
          name: player.name,
          gamesPlayed: 0,
          wins: 0,
          losses: 0,
          pointsFor: 0,
          pointsAgainst: 0,
        },
      ])
    ),
    fixedPairs: options.fixedPairs ?? [],
    keepApartPairs: options.keepApartPairs ?? [],
    skillBalance: options.skillBalance ?? false,
    onBreakIds: options.onBreakIds ?? [],
  };

  const lineups: QueuePlayer[][] = state.courts.map(
    (court) => court.players
  );

  for (let game = 0; game < games; game++) {
    const courtIndex = game % courtCount;
    const court = state.courts[courtIndex];

    clock += 60_000;

    const teamAWins = game % 2 === 0;

    const completed: CourtState = {
      ...court,
      status: "completed",
      completedAt: clock,
      scoreA: teamAWins ? 11 : 7,
      scoreB: teamAWins ? 7 : 11,
      winnerIds: (teamAWins
        ? court.players.slice(0, 2)
        : court.players.slice(2, 4)
      ).map((player) => player.id),
      loserIds: (teamAWins
        ? court.players.slice(2, 4)
        : court.players.slice(0, 2)
      ).map((player) => player.id),
    };

    state.courts[courtIndex] = completed;
    state.cycles.push({
      cycleNumber: state.cycles.length + 1,
      startedAt: court.startedAt ?? clock,
      completedAt: clock,
      courts: [completed],
    });

    for (const player of court.players) {
      state.playerStats[player.id].gamesPlayed += 1;
    }

    const plan = planNextCourt(state, completed);

    if (!plan) {
      throw new Error(
        `No plan for game ${game}`
      );
    }

    state.courts[courtIndex] = playingCourt(
      court.courtNumber,
      plan.players,
      clock
    );
    state.waitingPlayers = plan.waitingPlayers;
    lineups.push(plan.players);
  }

  return { state, lineups };
}

const teamsOf = (lineup: QueuePlayer[]) => [
  lineup.slice(0, 2).map((player) => player.id),
  lineup.slice(2, 4).map((player) => player.id),
];

const areTeammates = (
  lineup: QueuePlayer[],
  a: string,
  b: string
) =>
  teamsOf(lineup).some(
    (team) =>
      team.includes(a) && team.includes(b)
  );

const skillOf = (player: QueuePlayer) =>
  player.skillLevel === "5.0+"
    ? 5.5
    : player.skillLevel;

const teamGap = (lineup: QueuePlayer[]) =>
  Math.abs(
    skillOf(lineup[0]) +
      skillOf(lineup[1]) -
      skillOf(lineup[2]) -
      skillOf(lineup[3])
  );

// ------------------------------------------------------
// TESTS
// ------------------------------------------------------

describe("rotation fairness", () => {
  it("keeps games played within one game of each other", () => {
    const { state } = simulate({
      players: makePlayers(10),
      courtCount: 2,
      games: 40,
    });

    const counts = Object.values(
      state.playerStats
    ).map((stats) => stats.gamesPlayed);

    expect(
      Math.max(...counts) - Math.min(...counts)
    ).toBeLessThanOrEqual(1);
  });

  it("never puts the same player on two courts", () => {
    const { state } = simulate({
      players: makePlayers(11),
      courtCount: 2,
      games: 30,
    });

    const onCourt = state.courts.flatMap(
      (court) =>
        court.players.map((player) => player.id)
    );

    expect(new Set(onCourt).size).toBe(
      onCourt.length
    );
  });

  /*
   * For each finished game: a winner may go straight
   * back on while a loser from that court sits out
   * only if the loser has played more games (fair
   * turns come first).
   */
  function expectLosersStayOn(
    state: OpenPlayState,
    lineups: QueuePlayer[][]
  ) {
    const games = new Map<string, number>();
    let checked = 0;

    state.cycles.forEach((cycle, index) => {
      const finished = cycle.courts[0];

      for (const player of finished.players) {
        games.set(
          player.id,
          (games.get(player.id) ?? 0) + 1
        );
      }

      const next = new Set(
        lineups[index + finished.courtNumber].map(
          (player) => player.id
        )
      );

      for (const winner of finished.winnerIds) {
        for (const loser of finished.loserIds) {
          if (next.has(winner) && !next.has(loser)) {
            expect(games.get(loser)).toBeGreaterThan(
              games.get(winner) ?? 0
            );
            checked += 1;
          }
        }
      }
    });

    return checked;
  }

  it("gives the losing team the spots when some must play again", () => {
    // 6 players, 1 court: every game, 2 of the 4
    // players coming off must go straight back on.
    const { state, lineups } = simulate({
      players: makePlayers(6),
      courtCount: 1,
      games: 30,
    });

    expectLosersStayOn(state, lineups);

    // And losers really do replay: most games
    // send both losers straight back on.
    const bothLosersBack = state.cycles.filter(
      (cycle, index) => {
        const next = lineups[index + 1].map(
          (player) => player.id
        );

        return cycle.courts[0].loserIds.every((id) =>
          next.includes(id)
        );
      }
    ).length;

    expect(bothLosersBack).toBeGreaterThanOrEqual(
      state.cycles.length / 2
    );
  });

  it("applies losers-stay-on to fixed pairs too", () => {
    const { state, lineups } = simulate({
      players: makePlayers(6),
      courtCount: 1,
      games: 30,
      fixedPairs: [
        { playerA: "p0", playerB: "p1" },
      ],
    });

    expectLosersStayOn(state, lineups);
  });

  it("does not repeat a partner in back-to-back games", () => {
    const { lineups } = simulate({
      players: makePlayers(8),
      courtCount: 1,
      games: 20,
    });

    for (let i = 1; i < lineups.length; i++) {
      const previous = teamsOf(lineups[i - 1]).map(
        (team) => [...team].sort().join()
      );

      for (const team of teamsOf(lineups[i])) {
        expect(previous).not.toContain(
          [...team].sort().join()
        );
      }
    }
  });
});

describe("fixed pairs", () => {
  const fixedPairs: FixedPair[] = [
    { playerA: "p0", playerB: "p7" },
    { playerA: "p3", playerB: "p9" },
  ];

  it("keeps each pair together as teammates", () => {
    const { lineups } = simulate({
      players: makePlayers(10),
      courtCount: 2,
      games: 40,
      fixedPairs,
    });

    for (const lineup of lineups) {
      const ids = lineup.map((player) => player.id);

      for (const pair of fixedPairs) {
        const inA = ids.includes(pair.playerA);
        const inB = ids.includes(pair.playerB);

        expect(inA).toBe(inB);

        if (inA) {
          expect(
            areTeammates(
              lineup,
              pair.playerA,
              pair.playerB
            )
          ).toBe(true);
        }
      }
    }
  });

  it("keeps a pair made mid-session together when they are far apart in the queue", () => {
    const players = makePlayers(10);

    const completed: CourtState = {
      ...playingCourt(1, players.slice(6, 10), 0),
      status: "completed",
      completedAt: 1,
      scoreA: 11,
      scoreB: 5,
    };

    // p2 and p4 are 3rd and 5th in line. Queue order
    // alone would take p0-p3 and split them.
    const state = {
      players,
      waitingPlayers: players.slice(0, 6),
      courts: [completed],
      cycles: [],
      playerStats: {},
      fixedPairs: [
        { playerA: "p2", playerB: "p4" },
      ],
    } as unknown as OpenPlayState;

    const plan = planNextCourt(state, completed);
    const ids = plan!.players.map(
      (player) => player.id
    );

    expect(ids.includes("p2")).toBe(
      ids.includes("p4")
    );
  });

  it("builds a first round with pairs together", () => {
    const cycle = createPairedInitialCycle(
      makePlayers(10),
      2,
      fixedPairs
    );

    for (const court of cycle.courts) {
      expect(court.players).toHaveLength(4);

      const ids = court.players.map(
        (player) => player.id
      );

      for (const pair of fixedPairs) {
        expect(ids.includes(pair.playerA)).toBe(
          ids.includes(pair.playerB)
        );
      }
    }

    expect(cycle.waitingPlayers).toHaveLength(2);
  });
});

describe("keep-apart pairs", () => {
  it("never makes kept-apart players teammates", () => {
    const keepApartPairs: FixedPair[] = [
      { playerA: "p0", playerB: "p1" },
      { playerA: "p0", playerB: "p2" },
      { playerA: "p4", playerB: "p5" },
    ];

    const { lineups } = simulate({
      players: makePlayers(8),
      courtCount: 1,
      games: 30,
      keepApartPairs,
    });

    // The first round comes from queue order; the
    // rule applies to every game the rotation picks.
    for (const lineup of lineups.slice(1)) {
      for (const pair of keepApartPairs) {
        expect(
          areTeammates(
            lineup,
            pair.playerA,
            pair.playerB
          )
        ).toBe(false);
      }
    }
  });
});

describe("first round with pairs and keep-apart", () => {
  it("does not force kept-apart players to be teammates", () => {
    // Found in the practice run: Ben & Cara (fixed)
    // and Dan & Eve (kept apart) were the first four
    // in the queue, so Dan & Eve had to team up.
    const fixedPairs = [
      { playerA: "p0", playerB: "p1" },
    ];
    const keepApartPairs = [
      { playerA: "p2", playerB: "p3" },
    ];

    const cycle = createPairedInitialCycle(
      makePlayers(10),
      2,
      fixedPairs,
      keepApartPairs
    );

    const rules = buildMixRules(
      fixedPairs,
      keepApartPairs,
      false
    );

    expect(cycle.courts).toHaveLength(2);

    for (const court of cycle.courts) {
      expect(court.players).toHaveLength(4);

      const lineup = chooseBestTeamPairing(
        court.players,
        new Map(),
        new Map(),
        rules
      );

      expect(areTeammates(lineup, "p2", "p3")).toBe(false);
      expect(areTeammates(lineup, "p0", "p1")).toBe(
        lineup.some((player) => player.id === "p0")
      );
    }
  });
});

describe("breaks", () => {
  it("never picks a player on break but keeps them waiting", () => {
    const { lineups, state } = simulate({
      players: makePlayers(10),
      courtCount: 2,
      games: 20,
      onBreakIds: ["p9"],
    });

    // p9 starts in the waiting list (queue order),
    // so every rotation-picked game excludes them.
    for (const lineup of lineups) {
      expect(
        lineup.map((player) => player.id)
      ).not.toContain("p9");
    }

    expect(
      state.waitingPlayers.map((player) => player.id)
    ).toContain("p9");
  });

  it("returns no plan when fewer than four players are ready", () => {
    const players = makePlayers(5);

    const completed: CourtState = {
      ...playingCourt(1, players.slice(0, 4), 0),
      status: "completed",
      completedAt: 1,
      scoreA: 11,
      scoreB: 5,
    };

    const state = {
      players,
      waitingPlayers: [players[4]],
      courts: [completed],
      cycles: [],
      playerStats: {},
      onBreakIds: ["p0", "p1"],
    } as unknown as OpenPlayState;

    expect(planNextCourt(state, completed)).toBeNull();
  });
});

describe("skill balance", () => {
  // Alternating strong and weak players.
  const players = makePlayers(12, (i) =>
    i % 2 === 0 ? 4.5 : 3.0
  );

  const averageGap = (skillBalance: boolean) => {
    const { lineups } = simulate({
      players,
      courtCount: 2,
      games: 40,
      skillBalance,
    });

    const picked = lineups.slice(2);

    return (
      picked.reduce(
        (total, lineup) => total + teamGap(lineup),
        0
      ) / picked.length
    );
  };

  it("produces closer teams when turned on", () => {
    expect(averageGap(true)).toBeLessThan(
      averageGap(false)
    );
  });
});
