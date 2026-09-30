/*
 * Pure matchmaking logic: who plays next and how
 * teams are split. No Firebase access here, so it
 * can be tested directly.
 */

import { createInitialCycle } from "./fourOnFour";
import type {
  CourtState,
  FixedPair,
  OpenPlayState,
} from "./game";
import type { QueuePlayer } from "./queue";

/*
 * First-round courts that keep fixed pairs together.
 *
 * Players are grouped into units (a pair or a single)
 * in queue order, and each court is filled with the
 * earliest units that fit. A pair that does not fit
 * the remaining spots waits instead of being split.
 */
export function createPairedInitialCycle(
  players: QueuePlayer[],
  courtCount: number,
  fixedPairs: FixedPair[],
  keepApartPairs: FixedPair[] = []
) {
  // Without fixed pairs every group of four has a
  // split that avoids a single keep-apart pair, so
  // chooseBestTeamPairing handles it later.
  if (fixedPairs.length === 0) {
    return createInitialCycle(
      players,
      courtCount,
      1
    );
  }

  const rules = buildMixRules(
    fixedPairs,
    keepApartPairs,
    false
  );

  const { fixedPartners } = rules;

  const playerById = new Map(
    players.map((player) => [
      player.id,
      player,
    ])
  );

  const units: QueuePlayer[][] = [];
  const grouped = new Set<string>();

  for (const player of players) {
    if (grouped.has(player.id)) {
      continue;
    }

    const partner = playerById.get(
      fixedPartners.get(player.id) ?? ""
    );

    const unit = partner
      ? [player, partner]
      : [player];

    unit.forEach((member) =>
      grouped.add(member.id)
    );

    units.push(unit);
  }

  const courts: {
    courtNumber: number;
    players: QueuePlayer[];
  }[] = [];

  let remaining = units;

  for (
    let courtNumber = 1;
    courtNumber <= courtCount;
    courtNumber++
  ) {
    const pairs: QueuePlayer[][] = [];
    const singles: QueuePlayer[] = [];
    const leftOver: QueuePlayer[][] = [];

    let spots = 4;

    for (const unit of remaining) {
      // The unit that completes a court must leave a
      // team split with no kept-apart teammates (e.g.
      // a pair plus two kept-apart singles cannot
      // work). Such a unit waits for the next court.
      const completesCourt =
        unit.length === spots;

      if (
        completesCourt &&
        rules.keepApart.size > 0 &&
        getKeepApartPenalty(
          chooseBestTeamPairing(
            [...pairs.flat(), ...singles, ...unit],
            new Map(),
            new Map(),
            rules
          ),
          rules
        ) > 0
      ) {
        leftOver.push(unit);
        continue;
      }

      if (unit.length <= spots) {
        spots -= unit.length;

        if (unit.length === 2) {
          pairs.push(unit);
        } else {
          singles.push(unit[0]);
        }
      } else {
        leftOver.push(unit);
      }
    }

    // Only pairs left and one spot open: split
    // the next pair rather than leave the court
    // short. Its other half waits.
    while (spots > 0 && leftOver.length > 0) {
      const unit = leftOver.shift()!;

      singles.push(unit[0]);
      spots -= 1;

      if (unit.length === 2) {
        leftOver.unshift([unit[1]]);
      }
    }

    // Pairs first, so each pair lands on one
    // team: [A1, A2, B1, B2].
    courts.push({
      courtNumber,
      players: [
        ...pairs.flat(),
        ...singles,
      ],
    });

    remaining = leftOver;
  }

  return {
    cycleNumber: 1,
    courts,
    waitingPlayers: remaining.flat(),
  };
}

// ======================================================
// FAIR MIXER
// ======================================================

type PairHistory = Map<string, number>;

export function pairKey(
  playerA: string,
  playerB: string
): string {
  return playerA < playerB
    ? `${playerA}::${playerB}`
    : `${playerB}::${playerA}`;
}

function addPairHistory(
  history: PairHistory,
  playerA: string,
  playerB: string
) {
  const key = pairKey(
    playerA,
    playerB
  );

  history.set(
    key,
    (history.get(key) ?? 0) + 1
  );
}

function getPairHistoryCount(
  history: PairHistory,
  playerA: string,
  playerB: string
): number {
  return (
    history.get(
      pairKey(
        playerA,
        playerB
      )
    ) ?? 0
  );
}

// ------------------------------------------------------
// FIXED PAIRS
// ------------------------------------------------------

/*
 * Maps each paired player to their fixed partner,
 * in both directions.
 */
type FixedPartnerMap = Map<string, string>;

function buildFixedPartnerMap(
  fixedPairs: FixedPair[]
): FixedPartnerMap {
  const partners: FixedPartnerMap =
    new Map();

  for (
    const pair of
      fixedPairs
  ) {
    partners.set(
      pair.playerA,
      pair.playerB
    );

    partners.set(
      pair.playerB,
      pair.playerA
    );
  }

  return partners;
}

/*
 * Everything the mixer needs to know about the
 * admin's matching preferences.
 */
export type MixRules = {
  fixedPartners: FixedPartnerMap;
  // pairKey()s of players who must not be teammates.
  keepApart: Set<string>;
  skillBalance: boolean;
};

export function buildMixRules(
  fixedPairs: FixedPair[],
  keepApartPairs: FixedPair[],
  skillBalance: boolean
): MixRules {
  return {
    fixedPartners:
      buildFixedPartnerMap(fixedPairs),
    keepApart: new Set(
      keepApartPairs.map((pair) =>
        pairKey(pair.playerA, pair.playerB)
      )
    ),
    skillBalance,
  };
}

function buildMixRulesFromState(
  state: OpenPlayState
): MixRules {
  return buildMixRules(
    state.fixedPairs ?? [],
    state.keepApartPairs ?? [],
    state.skillBalance === true
  );
}

/*
 * Keep-apart teammates are effectively forbidden,
 * but as a penalty rather than a hard filter so a
 * court can still be filled if there is no way
 * around it.
 */
const KEEP_APART_PENALTY = 100000;

function getKeepApartPenalty(
  lineup: QueuePlayer[],
  rules: MixRules
): number {
  if (
    rules.keepApart.size === 0 ||
    lineup.length !== 4
  ) {
    return 0;
  }

  const [a1, a2, b1, b2] = lineup;

  return [
    [a1, a2],
    [b1, b2],
  ].filter(([x, y]) =>
    rules.keepApart.has(
      pairKey(x.id, y.id)
    )
  ).length * KEEP_APART_PENALTY;
}

function isFixedPair(
  fixedPartners: FixedPartnerMap,
  playerA: string,
  playerB: string
): boolean {
  return (
    fixedPartners.get(playerA) ===
    playerB
  );
}

/*
 * Partner repeats for a lineup, ignoring fixed
 * pairs (they are meant to repeat every game).
 */
function getPartnerRepeats(
  lineup: QueuePlayer[],
  partnerHistory: PairHistory,
  fixedPartners: FixedPartnerMap
): number {
  const [a1, a2, b1, b2] = lineup;

  let repeats = 0;

  for (const [x, y] of [
    [a1, a2],
    [b1, b2],
  ]) {
    if (
      !isFixedPair(
        fixedPartners,
        x.id,
        y.id
      )
    ) {
      repeats +=
        getPairHistoryCount(
          partnerHistory,
          x.id,
          y.id
        );
    }
  }

  return repeats;
}

/*
 * A group of four is valid when every fixed pair
 * is either fully inside it or fully outside it.
 *
 * Partners who are not in the pool (for example
 * still on another court) do not block the group.
 */
function keepsFixedPairsTogether(
  group: QueuePlayer[],
  poolIds: Set<string>,
  fixedPartners: FixedPartnerMap
): boolean {
  const groupIds = new Set(
    group.map((player) => player.id)
  );

  return group.every((player) => {
    const partnerId =
      fixedPartners.get(player.id);

    return (
      !partnerId ||
      !poolIds.has(partnerId) ||
      groupIds.has(partnerId)
    );
  });
}

// ------------------------------------------------------
// BUILD PARTNER / OPPONENT HISTORY
// ------------------------------------------------------

function buildMatchHistory(
  state: OpenPlayState
) {
  const partnerHistory:
    PairHistory = new Map();

  const opponentHistory:
    PairHistory = new Map();

  for (const cycle of state.cycles) {
    for (const court of cycle.courts) {
      if (
        court.status !== "completed" ||
        court.players.length !== 4
      ) {
        continue;
      }

      const [
        player1,
        player2,
        player3,
        player4,
      ] = court.players;

      // Team A partners
      addPairHistory(
        partnerHistory,
        player1.id,
        player2.id
      );

      // Team B partners
      addPairHistory(
        partnerHistory,
        player3.id,
        player4.id
      );

      // Cross-team opponents
      const teamA = [
        player1,
        player2,
      ];

      const teamB = [
        player3,
        player4,
      ];

      for (const playerA of teamA) {
        for (const playerB of teamB) {
          addPairHistory(
            opponentHistory,
            playerA.id,
            playerB.id
          );
        }
      }
    }
  }

  return {
    partnerHistory,
    opponentHistory,
  };
}

// ------------------------------------------------------
// TEST THE THREE POSSIBLE TEAM COMBINATIONS
// ------------------------------------------------------

// ------------------------------------------------------
// SKILL BALANCE
// ------------------------------------------------------

/*
 * Cost per skill level of difference between the
 * two teams' combined ratings. A repeat partner
 * (1000) still outweighs ~3 levels of imbalance.
 */
const SKILL_GAP_PENALTY = 300;

function skillValue(
  player: QueuePlayer
): number {
  const level = player.skillLevel;

  if (level === "5.0+") {
    return 5.5;
  }

  return typeof level === "number"
    ? level
    : 3.0;
}

function getSkillImbalancePenalty(
  lineup: QueuePlayer[],
  skillBalance: boolean
): number {
  if (!skillBalance || lineup.length !== 4) {
    return 0;
  }

  const [a1, a2, b1, b2] = lineup;

  const gap = Math.abs(
    skillValue(a1) +
      skillValue(a2) -
      skillValue(b1) -
      skillValue(b2)
  );

  return gap * SKILL_GAP_PENALTY;
}

export function chooseBestTeamPairing(
  players: QueuePlayer[],
  partnerHistory: PairHistory,
  opponentHistory: PairHistory,
  rules: MixRules
): QueuePlayer[] {
  if (players.length !== 4) {
    return players;
  }

  const { fixedPartners } = rules;

  const [
    p1,
    p2,
    p3,
    p4,
  ] = players;

  /*
   * These are the only three possible
   * teammate combinations for four players.
   *
   * Array order always means:
   *
   * [TeamA1, TeamA2, TeamB1, TeamB2]
   */

  const allOptions: QueuePlayer[][] = [
    [
      p1,
      p2,
      p3,
      p4,
    ],

    [
      p1,
      p3,
      p2,
      p4,
    ],

    [
      p1,
      p4,
      p2,
      p3,
    ],
  ];

  /*
   * Fixed pairs must be teammates. Keep only the
   * options where no fixed pair is split across
   * the net.
   */
  const pairedOptions =
    allOptions.filter(
      ([a1, a2, b1, b2]) =>
        [a1, a2].every(
          (a) =>
            ![b1, b2].some((b) =>
              isFixedPair(
                fixedPartners,
                a.id,
                b.id
              )
            )
        )
    );

  const options =
    pairedOptions.length > 0
      ? pairedOptions
      : allOptions;

  let bestPlayers =
    options[0];

  let bestScore =
    Number.POSITIVE_INFINITY;

  for (const option of options) {
    const [
      a1,
      a2,
      b1,
      b2,
    ] = option;

    const partnerRepeats =
      getPartnerRepeats(
        option,
        partnerHistory,
        fixedPartners
      );

    const opponentRepeats =
      getPairHistoryCount(
        opponentHistory,
        a1.id,
        b1.id
      ) +
      getPairHistoryCount(
        opponentHistory,
        a1.id,
        b2.id
      ) +
      getPairHistoryCount(
        opponentHistory,
        a2.id,
        b1.id
      ) +
      getPairHistoryCount(
        opponentHistory,
        a2.id,
        b2.id
      );

    /*
     * Repeated partners are much more
     * expensive than repeated opponents.
     */
    const score =
      partnerRepeats * 1000 +
      opponentRepeats * 25 +
      getSkillImbalancePenalty(
        option,
        rules.skillBalance
      ) +
      getKeepApartPenalty(
        option,
        rules
      );

    if (score < bestScore) {
      bestScore = score;
      bestPlayers = option;
    }
  }

  return bestPlayers;
}

// ------------------------------------------------------
// GENERATE GROUPS OF FOUR
// ------------------------------------------------------

function getFourPlayerCombinations(
  players: QueuePlayer[]
): QueuePlayer[][] {
  const combinations:
    QueuePlayer[][] = [];

  for (
    let a = 0;
    a < players.length - 3;
    a++
  ) {
    for (
      let b = a + 1;
      b < players.length - 2;
      b++
    ) {
      for (
        let c = b + 1;
        c < players.length - 1;
        c++
      ) {
        for (
          let d = c + 1;
          d < players.length;
          d++
        ) {
          combinations.push([
            players[a],
            players[b],
            players[c],
            players[d],
          ]);
        }
      }
    }
  }

  return combinations;
}

// ------------------------------------------------------
// CHOOSE BEST FOUR PLAYERS FOR ONE COURT
// ------------------------------------------------------

function chooseFairCourtPlayers(
  availablePlayers: QueuePlayer[],
  state: OpenPlayState,
  queuePosition: Map<string, number>,
  partnerHistory: PairHistory,
  opponentHistory: PairHistory,
  rules: MixRules
): QueuePlayer[] {
  if (availablePlayers.length < 4) {
    return [];
  }

  const { fixedPartners } = rules;

  /*
   * A paired player whose partner is still on
   * another court waits for them, so the pair
   * can go on together next time.
   *
   * If holding them back would leave fewer than
   * four players, let them play anyway.
   */
  const availableIds = new Set(
    availablePlayers.map(
      (player) => player.id
    )
  );

  const sessionIds = new Set(
    (state.players ?? []).map(
      (player) => player.id
    )
  );

  const partnerReady =
    availablePlayers.filter(
      (player) => {
        const partnerId =
          fixedPartners.get(player.id);

        return (
          !partnerId ||
          !sessionIds.has(partnerId) ||
          availableIds.has(partnerId)
        );
      }
    );

  const pool =
    partnerReady.length >= 4
      ? partnerReady
      : availablePlayers;

  const poolIds = new Set(
    pool.map((player) => player.id)
  );

  /*
   * First sort by:
   *
   * 1. Fewest games played
   * 2. Longest waiting position
   */

  const sorted =
  [...pool].sort(
    (a, b) => {
      const gamesA =
        state.playerStats[
          a.id
        ]?.gamesPlayed ?? 0;

      const gamesB =
        state.playerStats[
          b.id
        ]?.gamesPlayed ?? 0;

      const queueA =
        queuePosition.get(a.id) ??
        9999;

      const queueB =
        queuePosition.get(b.id) ??
        9999;

      /*
       * Protect the existing queue first.
       *
       * A late-arriving player should not
       * immediately jump someone already
       * near the front of the queue.
       */
      const queueDifference =
        queueA - queueB;

      if (
        Math.abs(queueDifference) >= 4
      ) {
        return queueDifference;
      }

      /*
       * When players are reasonably close
       * in the queue, help the player with
       * fewer games catch up.
       */
      if (gamesA !== gamesB) {
        return gamesA - gamesB;
      }

      /*
       * Same games played:
       * longest-waiting / earliest queue
       * player wins.
       */
      if (queueA !== queueB) {
        return queueA - queueB;
      }

      /*
       * Final deterministic tie-breaker.
       */
      return (
        (a.joinedAt ?? 0) -
        (b.joinedAt ?? 0)
      );
    }
  );

  /*
   * Looking at up to 12 players gives us
   * plenty of mixing possibilities without
   * generating huge combinations.
   */

  /*
   * A fixed partner is pulled in right after
   * their teammate so the pair is never split
   * by the 12-player cut-off.
   */
  const playerById = new Map(
    pool.map((player) => [
      player.id,
      player,
    ])
  );

  const candidatePlayers:
    QueuePlayer[] = [];

  const candidateIds =
    new Set<string>();

  for (const player of sorted) {
    if (candidatePlayers.length >= 12) {
      break;
    }

    if (candidateIds.has(player.id)) {
      continue;
    }

    candidatePlayers.push(player);
    candidateIds.add(player.id);

    const partner =
      playerById.get(
        fixedPartners.get(player.id) ??
          ""
      );

    if (
      partner &&
      !candidateIds.has(partner.id)
    ) {
      candidatePlayers.push(partner);
      candidateIds.add(partner.id);
    }
  }

  const allCombinations =
    getFourPlayerCombinations(
      candidatePlayers
    );

  const pairSafeCombinations =
    allCombinations.filter(
      (combination) =>
        keepsFixedPairsTogether(
          combination,
          poolIds,
          fixedPartners
        )
    );

  // Never leave a court empty because of pairs.
  const combinations =
    pairSafeCombinations.length > 0
      ? pairSafeCombinations
      : allCombinations;

  const minimumGames =
    Math.min(
      ...pool.map(
        (player) =>
          state.playerStats[
            player.id
          ]?.gamesPlayed ?? 0
      )
    );

  let bestCourt:
    QueuePlayer[] = [];

  let bestScore =
    Number.POSITIVE_INFINITY;

  for (const combination of combinations) {
    /*
     * Players with fewer games get
     * overwhelmingly higher priority.
     */

    const gameFairnessPenalty =
  combination.reduce(
    (total, player) => {
      const games =
        state.playerStats[
          player.id
        ]?.gamesPlayed ?? 0;

      const gamesBehind =
        games - minimumGames;

      return (
        total +
        gamesBehind * 2500
      );
    },
    0
  );

    /*
     * Earlier queue position is better.
     */

    const queuePenalty =
  combination.reduce(
    (total, player) => {
      const position =
        queuePosition.get(
          player.id
        ) ?? 9999;

      return (
        total +
        position * 100
      );
    },
    0
  );

    const pairedPlayers =
      chooseBestTeamPairing(
        combination,
        partnerHistory,
        opponentHistory,
        rules
      );

    const [
      a1,
      a2,
      b1,
      b2,
    ] = pairedPlayers;

    const partnerPenalty =
      getPartnerRepeats(
        pairedPlayers,
        partnerHistory,
        fixedPartners
      );

    const opponentPenalty =
      getPairHistoryCount(
        opponentHistory,
        a1.id,
        b1.id
      ) +
      getPairHistoryCount(
        opponentHistory,
        a1.id,
        b2.id
      ) +
      getPairHistoryCount(
        opponentHistory,
        a2.id,
        b1.id
      ) +
      getPairHistoryCount(
        opponentHistory,
        a2.id,
        b2.id
      );

    const totalScore =
      gameFairnessPenalty +
      partnerPenalty * 1000 +
      opponentPenalty * 25 +
      queuePenalty +
      getSkillImbalancePenalty(
        pairedPlayers,
        rules.skillBalance
      ) +
      getKeepApartPenalty(
        pairedPlayers,
        rules
      );

    if (totalScore < bestScore) {
      bestScore = totalScore;
      bestCourt =
        pairedPlayers;
    }
  }

  return bestCourt;
}
// ------------------------------------------------------
// PLAN THE NEXT GAME ON A FINISHED COURT
// ------------------------------------------------------

export interface NextCourtPlan {
  players: QueuePlayer[];
  waitingPlayers: QueuePlayer[];
}

/*
 * Picks the four players for a court that just
 * finished and returns the updated waiting list.
 *
 * Returns null when there are not enough ready
 * players; the court then stays finished until
 * someone becomes available.
 */
export function planNextCourt(
  state: OpenPlayState,
  completedCourt: CourtState
): NextCourtPlan | null {
  const otherPlayingIds = new Set(
    state.courts
      .filter(
        (court) =>
          court.courtNumber !==
            completedCourt.courtNumber &&
          court.status === "playing"
      )
      .flatMap((court) =>
        court.players.map((player) => player.id)
      )
  );

  // Waiting players first (in queue order), then
  // the players coming off this court.
  const rotationMap =
    new Map<string, QueuePlayer>();

  for (const player of [
    ...(state.waitingPlayers ?? []),
    ...completedCourt.players,
  ]) {
    if (
      !otherPlayingIds.has(player.id) &&
      !rotationMap.has(player.id)
    ) {
      rotationMap.set(player.id, player);
    }
  }

  const rotationQueue = Array.from(
    rotationMap.values()
  );

  const onBreak = new Set(
    state.onBreakIds ?? []
  );

  // Players on break keep their place in
  // rotationQueue but cannot be picked.
  const readyPlayers = rotationQueue.filter(
    (player) => !onBreak.has(player.id)
  );

  if (readyPlayers.length < 4) {
    return null;
  }

  const {
    partnerHistory,
    opponentHistory,
  } = buildMatchHistory(state);

  const queuePosition = new Map(
    readyPlayers.map((player, index) => [
      player.id,
      index,
    ])
  );

  const players = chooseFairCourtPlayers(
    readyPlayers,
    state,
    queuePosition,
    partnerHistory,
    opponentHistory,
    buildMixRulesFromState(state)
  );

  if (players.length !== 4) {
    return null;
  }

  const selectedIds = new Set(
    players.map((player) => player.id)
  );

  return {
    players,
    waitingPlayers: rotationQueue.filter(
      (player) => !selectedIds.has(player.id)
    ),
  };
}
