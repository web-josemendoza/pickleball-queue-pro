import {
  onValue,
  ref,
  remove,
  set,
} from "firebase/database";

import { db } from "./firebase";
import type { QueuePlayer } from "./queue";

import {
  createInitialCycle,
  createGameResult,
  updatePlayerRecords,
  type PlayerRecord,
} from "./fourOnFour";

// ======================================================
// TYPES
// ======================================================

export interface CourtState {
  courtNumber: number;
  players: QueuePlayer[];

  status:
    | "waiting"
    | "playing"
    | "completed";

  startedAt: number | null;
  completedAt: number | null;

  scoreA: number | null;
  scoreB: number | null;

  winnerIds: string[];
  loserIds: string[];
}

export interface CycleState {
  cycleNumber: number;

  startedAt: number;

  completedAt: number | null;

  courts: CourtState[];
}

export interface PlayerStats {
  playerId: string;
  name: string;

  gamesPlayed: number;
  wins: number;
  losses: number;

  pointsFor: number;
  pointsAgainst: number;
}

export interface OpenPlayState {
  sessionId: string;

  status:
    | "setup"
    | "active"
    | "finished";

  cycleNumber: number;

  playerCount: number;
  courtCount: number;
  durationHours: number;

  startedAt: number | null;
  endsAt: number | null;

  /*
   * ALL PLAYERS REGISTERED FOR THIS OPEN PLAY SESSION.
   *
   * This is important because after a cycle finishes
   * we need to know who played and who was waiting.
   */
  players: QueuePlayer[];

  /*
   * Players who are not currently playing.
   */
  waitingPlayers: QueuePlayer[];

  courts: CourtState[];

  cycles: CycleState[];

  playerStats: Record<
    string,
    PlayerStats
  >;
}

export interface ArchivedOpenPlaySession
  extends OpenPlayState {
  archivedAt: number;
}
// ======================================================
// DATABASE
// ======================================================

const GAME_PATH =
  "openPlay/game";

function gameRef() {
  return ref(db, GAME_PATH);
}

function sessionHistoryRef() {
  return ref(
    db,
    "openPlay/sessionHistory"
  );
}
// ======================================================
// SESSION HISTORY
// ======================================================

export async function archiveOpenPlaySession():
  Promise<string | null> {

  const snapshot =
    await new Promise<any>(
      (resolve) => {
        onValue(
          gameRef(),
          resolve,
          {
            onlyOnce: true,
          }
        );
      }
    );

  const state =
    snapshot.val() as
      | OpenPlayState
      | null;

  if (!state) {
    return null;
  }

  /*
   * Don't archive an empty session.
   */
  const completedGames =
    state.cycles.reduce(
      (total, cycle) =>
        total +
        cycle.courts.filter(
          (court) =>
            court.status ===
            "completed"
        ).length,
      0
    );

  if (completedGames === 0) {
    return null;
  }

  /*
   * Use the live session's stable ID.
   *
   * Retrying the archive writes to the same Firebase path,
   * so the same session cannot create duplicate history rows.
   *
   * The fallback supports older sessions that were created
   * before sessionId was added to OpenPlayState.
   */
  const sessionId =
    state.sessionId ||
    `session_${state.startedAt ?? Date.now()}`;

  const archivedAt =
    Date.now();

  const archivedSession:
    ArchivedOpenPlaySession = {
      ...state,
      sessionId,
      archivedAt,
    };

  await set(
    ref(
      db,
      `openPlay/sessionHistory/${sessionId}`
    ),
    archivedSession
  );

  return sessionId;
}

export function subscribeToSessionHistory(
  callback: (
    sessions:
      ArchivedOpenPlaySession[]
  ) => void
) {
  return onValue(
    sessionHistoryRef(),
    (snapshot) => {
      if (!snapshot.exists()) {
        callback([]);
        return;
      }

      const data =
        snapshot.val() as Record<
          string,
          ArchivedOpenPlaySession
        >;

      const sessions =
        Object.entries(data)
          .map(
            ([
              sessionId,
              session,
            ]) => ({
              ...session,
              sessionId:
                session.sessionId ??
                sessionId,
            })
          )
          .sort(
            (a, b) =>
              b.archivedAt -
              a.archivedAt
          );

      callback(sessions);
    }
  );
}

export async function deleteArchivedSession(
  sessionId: string
): Promise<void> {
  if (!sessionId) {
    throw new Error(
      "Session ID is required."
    );
  }

  await remove(
    ref(
      db,
      `openPlay/sessionHistory/${sessionId}`
    )
  );
}

// ======================================================
// COURT HELPERS
// ======================================================

function convertCourt(
  court: {
    courtNumber: number;
    players: QueuePlayer[];
  },
  startedAt: number
): CourtState {
  return {
    courtNumber:
      court.courtNumber,

    players:
      court.players,

    status:
      "playing",

    startedAt,

    completedAt:
      null,

    scoreA:
      null,

    scoreB:
      null,

    winnerIds:
      [],

    loserIds:
      [],
  };
}

// ======================================================
// CREATE EMPTY COURT
// ======================================================

export function createEmptyCourt(
  courtNumber: number
): CourtState {
  return {
    courtNumber,

    players: [],

    status:
      "waiting",

    startedAt:
      null,

    completedAt:
      null,

    scoreA:
      null,

    scoreB:
      null,

    winnerIds:
      [],

    loserIds:
      [],
  };
}

// ======================================================
// CREATE OPEN PLAY STATE
// ======================================================

export function createOpenPlayState(
  playerCount: number,
  courtCount: number,
  durationHours: number,
  players: QueuePlayer[] = []
): OpenPlayState {
  const courts: CourtState[] = [];

  for (
    let i = 1;
    i <= courtCount;
    i++
  ) {
    courts.push(
      createEmptyCourt(i)
    );
  }

  return {
    sessionId:
      `session_${Date.now()}_${Math.random()
        .toString(36)
        .slice(2, 8)}`,

    status:
      "setup",

    cycleNumber:
      0,

    playerCount,

    courtCount,

    durationHours,

    startedAt:
      null,

    endsAt:
      null,

    players,

    waitingPlayers:
      [...players],

    courts,

    cycles: [],

    playerStats: {},
  };
}

// ======================================================
// SAVE
// ======================================================

export async function saveOpenPlayState(
  state: OpenPlayState
): Promise<void> {
  await set(
    gameRef(),
    state
  );
}

// ======================================================
// START OPEN PLAY
// ======================================================

export async function startOpenPlay(
  playerCount: number,
  courtCount: number,
  durationHours: number,
  players: QueuePlayer[]
): Promise<void> {

  if (
    players.length <
    courtCount * 4
  ) {
    throw new Error(
      `Not enough players. Need at least ${
        courtCount * 4
      } players for ${
        courtCount
      } courts.`
    );
  }

  const startedAt =
    Date.now();

  const endsAt =
    startedAt +
    durationHours *
      60 *
      60 *
      1000;

  const cycle =
    createInitialCycle(
      players,
      courtCount,
      1
    );

  const courts =
    cycle.courts.map(
      (court) =>
        convertCourt(
          court,
          startedAt
        )
    );

  const state =
    createOpenPlayState(
      playerCount,
      courtCount,
      durationHours,
      players
    );

  state.status =
    "active";

  state.cycleNumber =
    1;

  state.startedAt =
    startedAt;

  state.endsAt =
    endsAt;

  state.courts =
    courts;

  state.waitingPlayers =
    cycle.waitingPlayers;

  state.cycles = [
    {
      cycleNumber:
        1,

      startedAt,

      completedAt:
        null,

      courts,
    },
  ];

  /*
   * Initialize statistics for every player.
   */
  for (
    const player of players
  ) {
    state.playerStats[
      player.id
    ] = {
      playerId:
        player.id,

      name:
        player.name,

      gamesPlayed:
        0,

      wins:
        0,

      losses:
        0,

      pointsFor:
        0,

      pointsAgainst:
        0,
    };
  }

  await saveOpenPlayState(
    state
  );
}

// ======================================================
// REAL-TIME SUBSCRIPTION
// ======================================================

export function subscribeToOpenPlay(
  callback: (
    state:
      | OpenPlayState
      | null
  ) => void
): () => void {

  return onValue(
    gameRef(),

    (snapshot) => {

      const data =
        snapshot.val();

      if (!data) {
        callback(null);
        return;
      }

      const raw =
        data as Partial<OpenPlayState>;

      // Normalize persisted Firebase data after refresh/reconnect.
      const courts =
        (raw.courts ?? []).map((court) => ({
          ...court,
          players: court.players ?? [],
          winnerIds: court.winnerIds ?? [],
          loserIds: court.loserIds ?? [],
        })) as CourtState[];

      const cycles =
        (raw.cycles ?? []).map((cycle) => ({
          ...cycle,
          courts: (cycle.courts ?? []).map((court) => ({
            ...court,
            players: court.players ?? [],
            winnerIds: court.winnerIds ?? [],
            loserIds: court.loserIds ?? [],
          })),
        })) as CycleState[];

      const normalizedState = {
        ...raw,
        sessionId:
          raw.sessionId ||
          `session_${raw.startedAt ?? Date.now()}`,
        players: raw.players ?? [],
        waitingPlayers: raw.waitingPlayers ?? [],
        courts,
        cycles,
        playerStats: raw.playerStats ?? {},
      } as OpenPlayState;

      callback(normalizedState);
    }
  );
}

// ======================================================
// FINISH ONE COURT
// ======================================================

export async function finishCourtGame(
  courtNumber: number,
  scoreA: number,
  scoreB: number
): Promise<void> {

  const snapshot =
    await new Promise<any>(
      (resolve) => {

        onValue(
          gameRef(),
          resolve,
          {
            onlyOnce:
              true,
          }
        );

      }
    );

  const state =
    snapshot.val() as
      | OpenPlayState
      | null;

  if (!state) {
    throw new Error(
      "No open play session found."
    );
  }

  if (
    state.status !==
    "active"
  ) {
    throw new Error(
      "Open play is not active."
    );
  }

  if (
    !Number.isFinite(scoreA) ||
    !Number.isFinite(scoreB)
  ) {
    throw new Error(
      "Scores must be valid numbers."
    );
  }

  if (
    scoreA < 0 ||
    scoreB < 0
  ) {
    throw new Error(
      "Scores cannot be negative."
    );
  }

  if (
    scoreA === scoreB
  ) {
    throw new Error(
      "A game cannot end in a tie."
    );
  }

  const courtIndex =
    state.courts.findIndex(
      (court) =>
        court.courtNumber ===
        courtNumber
    );

  if (
    courtIndex === -1
  ) {
    throw new Error(
      `Court ${courtNumber} not found.`
    );
  }

  const court =
    state.courts[
      courtIndex
    ];

  if (
    court.players.length !==
    4
  ) {
    throw new Error(
      `Court ${courtNumber} must have exactly 4 players.`
    );
  }

  if (
    court.status ===
    "completed"
  ) {
    throw new Error(
      `Court ${courtNumber} is already completed.`
    );
  }

  // --------------------------------------------
  // BUILD RESULT
  // --------------------------------------------

  const courtGroup = {
    courtNumber:
      court.courtNumber,

    players:
      court.players,
  };

  const result =
    createGameResult(
      courtGroup,
      scoreA,
      scoreB
    );

  // --------------------------------------------
  // UPDATE COURT
  // --------------------------------------------

  state.courts[
    courtIndex
  ] = {
    ...court,

    status:
      "completed",

    completedAt:
      result.completedAt,

    scoreA:
      result.scoreA,

    scoreB:
      result.scoreB,

    winnerIds:
      result.winnerIds,

    loserIds:
      result.loserIds,
  };

  // --------------------------------------------
  // UPDATE PLAYER RECORDS
  // --------------------------------------------

  const records:
    Record<
      string,
      PlayerRecord
    > = {};

  Object.entries(
    state.playerStats
  ).forEach(
    ([id, stats]) => {

      records[id] = {
        playerId:
          stats.playerId,

        name:
          stats.name,

        gamesPlayed:
          stats.gamesPlayed,

        wins:
          stats.wins,

        losses:
          stats.losses,

        pointsFor:
          stats.pointsFor,

        pointsAgainst:
          stats.pointsAgainst,
      };

    }
  );

  const updatedRecords =
    updatePlayerRecords(
      records,
      result
    );

  Object.entries(
    updatedRecords
  ).forEach(
    ([id, record]) => {

      state.playerStats[
        id
      ] = {
        playerId:
          record.playerId,

        name:
          record.name,

        gamesPlayed:
          record.gamesPlayed,

        wins:
          record.wins,

        losses:
          record.losses,

        pointsFor:
          record.pointsFor,

        pointsAgainst:
          record.pointsAgainst,
      };

    }
  );

  // --------------------------------------------
  // UPDATE CYCLE
  // --------------------------------------------

  const cycleIndex =
    state.cycles.findIndex(
      (cycle) =>
        cycle.cycleNumber ===
        state.cycleNumber
    );

  if (
    cycleIndex !== -1
  ) {

    const allCompleted =
      state.courts.every(
        (currentCourt) =>
          currentCourt.status ===
          "completed"
      );

    state.cycles[
      cycleIndex
    ] = {

      ...state.cycles[
        cycleIndex
      ],

      courts:
        state.courts,

      completedAt:
        allCompleted
          ? result.completedAt
          : null,
    };
  }

  // --------------------------------------------
  // SESSION TIME CHECK
  // --------------------------------------------

  if (
    state.endsAt &&
    Date.now() >=
      state.endsAt
  ) {

    state.status =
      "finished";

  }

  await saveOpenPlayState(
    state
  );
}

// ======================================================
// BUILD NEXT COURTS
// ======================================================


// ======================================================
// START NEXT CYCLE
// ======================================================

// ======================================================
// FAIR MIXER
// ======================================================

type PairHistory = Map<string, number>;

function pairKey(
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

function chooseBestTeamPairing(
  players: QueuePlayer[],
  partnerHistory: PairHistory,
  opponentHistory: PairHistory
): QueuePlayer[] {
  if (players.length !== 4) {
    return players;
  }

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

  const options: QueuePlayer[][] = [
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
      getPairHistoryCount(
        partnerHistory,
        a1.id,
        a2.id
      ) +
      getPairHistoryCount(
        partnerHistory,
        b1.id,
        b2.id
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
      opponentRepeats * 25;

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
  opponentHistory: PairHistory
): QueuePlayer[] {
  if (availablePlayers.length < 4) {
    return [];
  }

  /*
   * First sort by:
   *
   * 1. Fewest games played
   * 2. Longest waiting position
   */

  const sorted =
  [...availablePlayers].sort(
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

  const candidatePlayers =
    sorted.slice(
      0,
      Math.min(
        12,
        sorted.length
      )
    );

  const combinations =
    getFourPlayerCombinations(
      candidatePlayers
    );

  const minimumGames =
    Math.min(
      ...availablePlayers.map(
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
        opponentHistory
      );

    const [
      a1,
      a2,
      b1,
      b2,
    ] = pairedPlayers;

    const partnerPenalty =
      getPairHistoryCount(
        partnerHistory,
        a1.id,
        a2.id
      ) +
      getPairHistoryCount(
        partnerHistory,
        b1.id,
        b2.id
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
      queuePenalty;

    if (totalScore < bestScore) {
      bestScore = totalScore;
      bestCourt =
        pairedPlayers;
    }
  }

  return bestCourt;
}

export async function startNextCycle(): Promise<void> {
  const snapshot =
    await new Promise<any>((resolve) => {
      onValue(
        gameRef(),
        resolve,
        {
          onlyOnce: true,
        }
      );
    });

  const state =
    snapshot.val() as
      | OpenPlayState
      | null;

  if (!state) {
    throw new Error(
      "No open play session found."
    );
  }

  if (state.status !== "active") {
    throw new Error(
      "Open play is not active."
    );
  }

  // Do not start another cycle until
  // every court has finished.
  const allCourtsCompleted =
    state.courts.every(
      (court) =>
        court.status === "completed"
    );

  if (!allCourtsCompleted) {
    throw new Error(
      "Finish every court before starting the next cycle."
    );
  }

  // Check session time.
  if (
    state.endsAt &&
    Date.now() >= state.endsAt
  ) {
    state.status = "finished";

    await saveOpenPlayState(state);

    return;
  }

  // Players who just finished playing.
  const justPlayed =
    state.courts.flatMap(
      (court) => court.players
    );

  /*
   * 4-ON / 4-OFF ROTATION
   *
   * Existing waiting players go first.
   * Players who just played go to the back.
   *
   * Example:
   *
   * Court:   1 2 3 4
   * Waiting: 5 6 7 8
   *
   * New queue:
   * 5 6 7 8 1 2 3 4
   */
  const rotationQueue = [
    ...(state.waitingPlayers ?? []),
    ...justPlayed,
  ];

  const playableCount =
    state.courtCount * 4;

  if (
  rotationQueue.length <
  playableCount
) {
  throw new Error(
    `Not enough players to fill ${state.courtCount} courts.`
  );
}

const {
  partnerHistory,
  opponentHistory,
} = buildMatchHistory(state);

const queuePosition =
  new Map<string, number>();

rotationQueue.forEach(
  (player, index) => {
    queuePosition.set(
      player.id,
      index
    );
  }
);

let availablePlayers = [
  ...rotationQueue,
];

const selectedCourtPlayers:
  QueuePlayer[][] = [];

const playingIds =
  new Set<string>();

for (
  let courtIndex = 0;
  courtIndex < state.courtCount;
  courtIndex++
) {
  const courtPlayers =
    chooseFairCourtPlayers(
      availablePlayers,
      state,
      queuePosition,
      partnerHistory,
      opponentHistory
    );

  if (courtPlayers.length !== 4) {
    throw new Error(
      `Unable to create Court ${
        courtIndex + 1
      }.`
    );
  }

  selectedCourtPlayers.push(
    courtPlayers
  );

  courtPlayers.forEach(
    (player) => {
      playingIds.add(
        player.id
      );
    }
  );

  availablePlayers =
    availablePlayers.filter(
      (player) =>
        !playingIds.has(
          player.id
        )
    );
}

const nextWaitingPlayers =
  rotationQueue.filter(
    (player) =>
      !playingIds.has(
        player.id
      )
  );

  const startedAt = Date.now();

  const nextCourts: CourtState[] = [];

  for (
    let courtIndex = 0;
    courtIndex < state.courtCount;
    courtIndex++
  ) {
    const courtPlayers =
  selectedCourtPlayers[
    courtIndex
  ];

    nextCourts.push({
      courtNumber:
        courtIndex + 1,

      players:
        courtPlayers,

      status:
        "playing",

      startedAt,

      completedAt:
        null,

      scoreA:
        null,

      scoreB:
        null,

      winnerIds:
        [],

      loserIds:
        [],
    });
  }

  state.cycleNumber += 1;

  state.courts =
    nextCourts;

  // VERY IMPORTANT:
  // Save the new waiting order.
  state.waitingPlayers =
    nextWaitingPlayers;

  state.cycles.push({
    cycleNumber:
      state.cycleNumber,

    startedAt,

    completedAt:
      null,

    courts:
      nextCourts,
  });

  await saveOpenPlayState(
    state
  );
}

// ======================================================
// ADMIN - UPDATE COURT LINEUP
// ======================================================

export async function updateCourtLineup(
  courtNumber: number,
  playerIds: string[]
): Promise<void> {
  // ----------------------------------------------------
  // VALIDATE INPUT
  // ----------------------------------------------------

  if (playerIds.length !== 4) {
    throw new Error(
      "A court must have exactly 4 players."
    );
  }

  const uniqueIds =
    new Set(playerIds);

  if (uniqueIds.size !== 4) {
    throw new Error(
      "The same player cannot be selected twice."
    );
  }

  // ----------------------------------------------------
  // LOAD CURRENT GAME
  // ----------------------------------------------------

  const snapshot =
    await new Promise<any>(
      (resolve) => {
        onValue(
          gameRef(),
          resolve,
          {
            onlyOnce: true,
          }
        );
      }
    );

  const state =
    snapshot.val() as
      | OpenPlayState
      | null;

  if (!state) {
    throw new Error(
      "No open play session found."
    );
  }

  if (
    state.status !== "active"
  ) {
    throw new Error(
      "Open play is not active."
    );
  }

  // ----------------------------------------------------
  // FIND COURT
  // ----------------------------------------------------

  const courtIndex =
    state.courts.findIndex(
      (court) =>
        court.courtNumber ===
        courtNumber
    );

  if (courtIndex === -1) {
    throw new Error(
      `Court ${courtNumber} not found.`
    );
  }

  const currentCourt =
    state.courts[
      courtIndex
    ];

  if (
    currentCourt.status !==
    "playing"
  ) {
    throw new Error(
      "Only a currently playing court can be edited."
    );
  }

  // ----------------------------------------------------
  // FIND SELECTED PLAYERS
  // ----------------------------------------------------

  const playerById =
    new Map(
      state.players.map(
        (player) => [
          player.id,
          player,
        ]
      )
    );

  const selectedPlayers =
    playerIds.map(
      (playerId) => {
        const player =
          playerById.get(
            playerId
          );

        if (!player) {
          throw new Error(
            "One of the selected players is not part of this session."
          );
        }

        return player;
      }
    );

  // ----------------------------------------------------
  // PREVENT STEALING PLAYER FROM ANOTHER COURT
  // ----------------------------------------------------

  const otherCourtPlayerIds =
    new Set(
      state.courts
        .filter(
          (court) =>
            court.courtNumber !==
              courtNumber &&
            court.status ===
              "playing"
        )
        .flatMap(
          (court) =>
            court.players.map(
              (player) =>
                player.id
            )
        )
    );

  for (
    const player of
      selectedPlayers
  ) {
    if (
      otherCourtPlayerIds.has(
        player.id
      )
    ) {
      throw new Error(
        `${player.name} is already playing on another court.`
      );
    }
  }

  // ----------------------------------------------------
  // BUILD NEW WAITING QUEUE
  // ----------------------------------------------------

  const selectedIdSet =
    new Set(
      selectedPlayers.map(
        (player) =>
          player.id
      )
    );

  /*
   * Players currently on this court who were removed
   * by the admin should return to the waiting queue.
   */
  const removedPlayers =
    currentCourt.players.filter(
      (player) =>
        !selectedIdSet.has(
          player.id
        )
    );

  /*
   * Remove newly selected players from waiting.
   */
  const remainingWaitingPlayers =
    (
      state.waitingPlayers ??
      []
    ).filter(
      (player) =>
        !selectedIdSet.has(
          player.id
        )
    );

  /*
   * Put replaced court players at the FRONT.
   *
   * They were supposed to play this cycle, so they
   * should receive high priority for the next court.
   */
  const waitingMap =
    new Map<
      string,
      QueuePlayer
    >();

  for (
    const player of
      removedPlayers
  ) {
    waitingMap.set(
      player.id,
      player
    );
  }

  for (
    const player of
      remainingWaitingPlayers
  ) {
    if (
      !waitingMap.has(
        player.id
      )
    ) {
      waitingMap.set(
        player.id,
        player
      );
    }
  }

  state.waitingPlayers =
    Array.from(
      waitingMap.values()
    );

  // ----------------------------------------------------
  // UPDATE CURRENT COURT
  // ----------------------------------------------------

  state.courts[
    courtIndex
  ] = {
    ...currentCourt,

    /*
     * IMPORTANT:
     *
     * 0 + 1 = Team A
     * 2 + 3 = Team B
     */
    players:
      selectedPlayers,

    // Reset the game timer because the
    // admin changed the lineup.
    startedAt:
      Date.now(),

    completedAt:
      null,

    scoreA:
      null,

    scoreB:
      null,

    winnerIds:
      [],

    loserIds:
      [],
  };

  // ----------------------------------------------------
  // UPDATE CURRENT CYCLE
  // ----------------------------------------------------

  const cycleIndex =
    state.cycles.findIndex(
      (cycle) =>
        cycle.cycleNumber ===
        state.cycleNumber
    );

  if (
    cycleIndex !== -1
  ) {
    state.cycles[
      cycleIndex
    ] = {
      ...state.cycles[
        cycleIndex
      ],

      courts:
        state.courts,

      completedAt:
        null,
    };
  }

  // ----------------------------------------------------
  // SAVE
  // ----------------------------------------------------

  await saveOpenPlayState(
    state
  );
}

// ======================================================
// FINISH SESSION
// ======================================================

export async function finishOpenPlay(): Promise<void> {

  const snapshot =
    await new Promise<any>(
      (resolve) => {

        onValue(
          gameRef(),
          resolve,
          {
            onlyOnce:
              true,
          }
        );

      }
    );

  const state =
    snapshot.val() as
      | OpenPlayState
      | null;

  if (!state) {
    return;
  }

  state.status =
    "finished";

  await saveOpenPlayState(
    state
  );
}

// ======================================================
// CLEAR SESSION
// ======================================================

// ======================================================
// ADMIN - ADD GUEST PLAYER
// ======================================================

export async function addGuestPlayerToSession(
  name: string,
  skillLevel: QueuePlayer["skillLevel"]
): Promise<void> {
  const cleanName = name.trim();

  if (!cleanName) {
    throw new Error(
      "Please enter the player's name."
    );
  }

  const snapshot =
    await new Promise<any>((resolve) => {
      onValue(gameRef(), resolve, {
        onlyOnce: true,
      });
    });

  const state =
    snapshot.val() as OpenPlayState | null;

  if (!state) {
    throw new Error(
      "No open play session found."
    );
  }

  if (state.status !== "active") {
    throw new Error(
      "Open play is not active."
    );
  }

  // Prevent confusing duplicate names.
  const duplicateName =
    state.players.some(
      (player) =>
        player.name
          .trim()
          .toLowerCase() ===
        cleanName.toLowerCase()
    );

  if (duplicateName) {
    throw new Error(
      "A player with that name is already in this session."
    );
  }

  const guestId =
    `guest_${Date.now()}_${Math.random()
      .toString(36)
      .slice(2, 8)}`;

  const guestPlayer: QueuePlayer = {
    id: guestId,
    name: cleanName,
    skillLevel,
    joinedAt: Date.now(),
  };

  // Add to complete session roster.
  state.players = [
    ...state.players,
    guestPlayer,
  ];

  // New guest starts at the back of waiting.
  state.waitingPlayers = [
    ...(state.waitingPlayers ?? []),
    guestPlayer,
  ];

  // Initialize ranking/statistics.
  state.playerStats[guestId] = {
    playerId: guestId,
    name: cleanName,
    gamesPlayed: 0,
    wins: 0,
    losses: 0,
    pointsFor: 0,
    pointsAgainst: 0,
  };

  state.playerCount =
    state.players.length;

  await saveOpenPlayState(state);
}



// ======================================================
// ADMIN - LINK GUEST TO REGISTERED ACCOUNT
// ======================================================

export async function linkGuestPlayerToAccount(
  guestPlayerId: string,
  accountPlayer: QueuePlayer
): Promise<void> {
  if (!guestPlayerId.startsWith("guest_")) {
    throw new Error("Only guest players can be linked.");
  }

  const snapshot =
    await new Promise<any>((resolve) => {
      onValue(gameRef(), resolve, {
        onlyOnce: true,
      });
    });

  const state =
    snapshot.val() as OpenPlayState | null;

  if (!state) {
    throw new Error("No open play session found.");
  }

  if (state.status !== "active") {
    throw new Error("Open play is not active.");
  }

  const guestPlayer =
    state.players.find(
      (player) =>
        player.id === guestPlayerId
    );

  if (!guestPlayer) {
    throw new Error(
      "Guest player is not part of this session."
    );
  }

  if (
    state.players.some(
      (player) =>
        player.id === accountPlayer.id &&
        player.id !== guestPlayerId
    )
  ) {
    throw new Error(
      `${accountPlayer.name} is already part of this session.`
    );
  }

  const linkedPlayer: QueuePlayer = {
    ...guestPlayer,
    id: accountPlayer.id,
    name: accountPlayer.name,
    skillLevel: accountPlayer.skillLevel,
  };

  const replacePlayer = (
    player: QueuePlayer
  ): QueuePlayer =>
    player.id === guestPlayerId
      ? linkedPlayer
      : player;

  state.players =
    state.players.map(replacePlayer);

  state.waitingPlayers =
    (state.waitingPlayers ?? []).map(
      replacePlayer
    );

  state.courts =
    state.courts.map((court) => ({
      ...court,
      players:
        court.players.map(replacePlayer),
      winnerIds:
        (court.winnerIds ?? []).map((id) =>
          id === guestPlayerId
            ? accountPlayer.id
            : id
        ),
      loserIds:
        (court.loserIds ?? []).map((id) =>
          id === guestPlayerId
            ? accountPlayer.id
            : id
        ),
    }));

  state.cycles =
    state.cycles.map((cycle) => ({
      ...cycle,
      courts:
        cycle.courts.map((court) => ({
          ...court,
          players:
            court.players.map(
              replacePlayer
            ),
          winnerIds:
            (court.winnerIds ?? []).map((id) =>
              id === guestPlayerId
                ? accountPlayer.id
                : id
            ),
          loserIds:
            (court.loserIds ?? []).map((id) =>
              id === guestPlayerId
                ? accountPlayer.id
                : id
            ),
        })),
    }));

  const guestStats =
    state.playerStats[
      guestPlayerId
    ];

  if (guestStats) {
    state.playerStats[
      accountPlayer.id
    ] = {
      ...guestStats,
      playerId:
        accountPlayer.id,
      name:
        accountPlayer.name,
    };

    delete state.playerStats[
      guestPlayerId
    ];
  } else {
    state.playerStats[
      accountPlayer.id
    ] = {
      playerId:
        accountPlayer.id,
      name:
        accountPlayer.name,
      gamesPlayed: 0,
      wins: 0,
      losses: 0,
      pointsFor: 0,
      pointsAgainst: 0,
    };
  }

  state.playerCount =
    state.players.length;

  await saveOpenPlayState(state);
}


// ======================================================
// ADMIN - REMOVE PLAYER FROM SESSION
// ======================================================

export async function removePlayerFromSession(
  playerId: string
): Promise<void> {
  const snapshot =
    await new Promise<any>((resolve) => {
      onValue(gameRef(), resolve, {
        onlyOnce: true,
      });
    });

  const state =
    snapshot.val() as OpenPlayState | null;

  if (!state) {
    throw new Error(
      "No open play session found."
    );
  }

  if (state.status !== "active") {
    throw new Error(
      "Open play is not active."
    );
  }

  const player =
    state.players.find(
      (item) =>
        item.id === playerId
    );

  if (!player) {
    throw new Error(
      "Player is not part of this session."
    );
  }

  // --------------------------------------------
  // Check whether player is currently on court
  // --------------------------------------------

  const playingCourt =
    state.courts.find(
      (court) =>
        court.status === "playing" &&
        court.players.some(
          (courtPlayer) =>
            courtPlayer.id ===
            playerId
        )
    );

  if (playingCourt) {
    throw new Error(
      `${player.name} is currently playing on Court ${playingCourt.courtNumber}. Edit that court lineup first before removing this player.`
    );
  }

  // --------------------------------------------
  // Remove from roster
  // --------------------------------------------

  state.players =
    state.players.filter(
      (item) =>
        item.id !== playerId
    );

  // --------------------------------------------
  // Remove from waiting queue
  // --------------------------------------------

  state.waitingPlayers =
    (
      state.waitingPlayers ?? []
    ).filter(
      (item) =>
        item.id !== playerId
    );

  state.playerCount =
    state.players.length;

  /*
   * IMPORTANT:
   * Keep playerStats.
   *
   * If the player already completed games,
   * deleting their stats would corrupt the
   * session rankings/history.
   */

  await saveOpenPlayState(state);
}

export async function clearOpenPlay(): Promise<void> {

  await remove(
    gameRef()
  );

}

// ======================================================
// RANK PLAYERS
// ======================================================

export function getRankedPlayers(
  state: OpenPlayState
): PlayerStats[] {

  return Object.values(
    state.playerStats
  ).sort(
    (a, b) => {

      /*
       * 1. MOST WINS
       */
      if (
        b.wins !==
        a.wins
      ) {

        return (
          b.wins -
          a.wins
        );

      }

      /*
       * 2. WIN %
       */
      const winRateA =
        a.gamesPlayed > 0
          ? a.wins /
            a.gamesPlayed
          : 0;

      const winRateB =
        b.gamesPlayed > 0
          ? b.wins /
            b.gamesPlayed
          : 0;

      if (
        winRateB !==
        winRateA
      ) {

        return (
          winRateB -
          winRateA
        );

      }

      /*
       * 3. POINT DIFFERENTIAL
       */
      const diffA =
        a.pointsFor -
        a.pointsAgainst;

      const diffB =
        b.pointsFor -
        b.pointsAgainst;

      if (
        diffB !==
        diffA
      ) {

        return (
          diffB -
          diffA
        );

      }

      /*
       * 4. GAMES PLAYED
       */
      return (
        b.gamesPlayed -
        a.gamesPlayed
      );
    }
  );
}