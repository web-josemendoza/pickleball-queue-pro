import {
  onValue,
  ref,
  remove,
  runTransaction,
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

  // Unsubmitted score inputs. These survive refresh/reconnect
  // but do not count as a completed game.
  draftScoreA?: string | null;
  draftScoreB?: string | null;

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

/*
 * Two players who always play on the same team.
 * The rotation only puts them on court together.
 */
export interface FixedPair {
  playerA: string;
  playerB: string;
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

  // Optional so sessions saved before this
  // feature still load.
  fixedPairs?: FixedPair[];
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

/*
 * Pairs set up before a session starts.
 * startOpenPlay moves them into the session.
 */
function pendingFixedPairsRef() {
  return ref(
    db,
    "openPlay/pendingFixedPairs"
  );
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

/*
 * First-round courts that keep fixed pairs together.
 *
 * Players are grouped into units (a pair or a single)
 * in queue order, and each court is filled with the
 * earliest units that fit. A pair that does not fit
 * the remaining spots waits instead of being split.
 */
function createPairedInitialCycle(
  players: QueuePlayer[],
  courtCount: number,
  fixedPairs: FixedPair[]
) {
  if (fixedPairs.length === 0) {
    return createInitialCycle(
      players,
      courtCount,
      1
    );
  }

  const fixedPartners = new Map<string, string>();

  for (const pair of fixedPairs) {
    fixedPartners.set(pair.playerA, pair.playerB);
    fixedPartners.set(pair.playerB, pair.playerA);
  }

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

export async function startOpenPlay(
  playerCount: number,
  courtCount: number,
  durationHours: number,
  players: QueuePlayer[],
  fixedPairs: FixedPair[] = []
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

  // Keep only pairs whose players both joined.
  const playerIds = new Set(
    players.map((player) => player.id)
  );

  const sessionPairs =
    fixedPairs.filter(
      (pair) =>
        playerIds.has(pair.playerA) &&
        playerIds.has(pair.playerB)
    );

  const cycle =
    createPairedInitialCycle(
      players,
      courtCount,
      sessionPairs
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

  state.fixedPairs =
    sessionPairs;

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

  // The pairs now live in the session.
  await remove(
    pendingFixedPairsRef()
  );
}

// ======================================================
// FIXED PAIRS BEFORE A SESSION
// ======================================================

/*
 * Returns an error message when the new pair is not
 * allowed, or null when it is fine.
 */
function getFixedPairError(
  existingPairs: FixedPair[],
  playerAId: string,
  playerBId: string
): string | null {
  if (!playerAId || !playerBId) {
    return "Choose two players to pair.";
  }

  if (playerAId === playerBId) {
    return "A player cannot be paired with themselves.";
  }

  const alreadyPaired = [
    playerAId,
    playerBId,
  ].some((id) =>
    existingPairs.some(
      (pair) =>
        pair.playerA === id ||
        pair.playerB === id
    )
  );

  if (alreadyPaired) {
    return "One of these players is already in a fixed pair. Unpair them first.";
  }

  return null;
}

export function subscribeToPendingFixedPairs(
  callback: (pairs: FixedPair[]) => void
): () => void {
  return onValue(
    pendingFixedPairsRef(),
    (snapshot) => {
      callback(
        (snapshot.val() as FixedPair[] | null) ??
          []
      );
    }
  );
}

export async function addPendingFixedPair(
  playerAId: string,
  playerBId: string
): Promise<void> {
  let failureMessage: string | null = null;

  const result = await runTransaction(
    pendingFixedPairsRef(),
    (current) => {
      const pairs =
        (current as FixedPair[] | null) ?? [];

      failureMessage = getFixedPairError(
        pairs,
        playerAId,
        playerBId
      );

      if (failureMessage) {
        return;
      }

      return [
        ...pairs,
        {
          playerA: playerAId,
          playerB: playerBId,
        },
      ];
    }
  );

  if (!result.committed) {
    throw new Error(
      failureMessage ??
      "Unable to pair players. Please try again."
    );
  }
}

export async function removePendingFixedPair(
  playerId: string
): Promise<void> {
  await runTransaction(
    pendingFixedPairsRef(),
    (current) =>
      ((current as FixedPair[] | null) ?? [])
        .filter(
          (pair) =>
            pair.playerA !== playerId &&
            pair.playerB !== playerId
        )
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
          draftScoreA: court.draftScoreA ?? null,
          draftScoreB: court.draftScoreB ?? null,
          winnerIds: court.winnerIds ?? [],
          loserIds: court.loserIds ?? [],
        })) as CourtState[];

      const cycles =
        (raw.cycles ?? []).map((cycle) => ({
          ...cycle,
          courts: (cycle.courts ?? []).map((court) => ({
            ...court,
            players: court.players ?? [],
            draftScoreA: court.draftScoreA ?? null,
            draftScoreB: court.draftScoreB ?? null,
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
        fixedPairs: raw.fixedPairs ?? [],
      } as OpenPlayState;

      callback(normalizedState);
    }
  );
}

// ======================================================
// SAVE IN-PROGRESS COURT SCORE
// ======================================================

export async function saveCourtDraftScore(
  courtNumber: number,
  scoreA: string,
  scoreB: string
): Promise<void> {
  await runTransaction(
    gameRef(),
    (current) => {
      const state =
        current as OpenPlayState | null;

      if (
        !state ||
        state.status !== "active"
      ) {
        return;
      }

      const courtIndex =
        (state.courts ?? []).findIndex(
          (court) =>
            court.courtNumber === courtNumber
        );

      if (courtIndex === -1) {
        return;
      }

      const court =
        state.courts[courtIndex];

      if (court.status !== "playing") {
        return;
      }

      state.courts[courtIndex] = {
        ...court,
        draftScoreA: scoreA,
        draftScoreB: scoreB,
      };

      // Find the history entry that actually owns this
      // currently-playing court. Independent rotation means
      // it is not always state.cycleNumber.
      for (
        let i = state.cycles.length - 1;
        i >= 0;
        i--
      ) {
        const historyCourtIndex =
          (state.cycles[i].courts ?? [])
            .findIndex(
              (item) =>
                item.courtNumber === courtNumber &&
                item.startedAt === court.startedAt
            );

        if (historyCourtIndex >= 0) {
          state.cycles[i].courts[
            historyCourtIndex
          ] = {
            ...state.cycles[i].courts[
              historyCourtIndex
            ],
            draftScoreA: scoreA,
            draftScoreB: scoreB,
          };
          break;
        }
      }

      return state;
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
  if (
    !Number.isFinite(scoreA) ||
    !Number.isFinite(scoreB)
  ) {
    throw new Error(
      "Scores must be valid numbers."
    );
  }

  if (scoreA < 0 || scoreB < 0) {
    throw new Error(
      "Scores cannot be negative."
    );
  }

  if (scoreA === scoreB) {
    throw new Error(
      "A game cannot end in a tie."
    );
  }

  let failureMessage: string | null = null;

  const result = await runTransaction(
    gameRef(),
    (current) => {
      const state =
        current as OpenPlayState | null;

      if (!state) {
        failureMessage =
          "No open play session found.";
        return;
      }

      if (state.status !== "active") {
        failureMessage =
          "Open play is not active.";
        return;
      }

      const courtIndex =
        state.courts.findIndex(
          (court) =>
            court.courtNumber === courtNumber
        );

      if (courtIndex === -1) {
        failureMessage =
          `Court ${courtNumber} not found.`;
        return;
      }

      const court =
        state.courts[courtIndex];

      if (court.players.length !== 4) {
        failureMessage =
          `Court ${courtNumber} must have exactly 4 players.`;
        return;
      }

      // This is the concurrency guard. If another admin
      // already finished this exact game, the transaction
      // aborts instead of counting it twice.
      if (court.status !== "playing") {
        failureMessage =
          `Court ${courtNumber} is already completed or has changed.`;
        return;
      }

      const courtGroup = {
        courtNumber: court.courtNumber,
        players: court.players,
      };

      const gameResult =
        createGameResult(
          courtGroup,
          scoreA,
          scoreB
        );

      const completedCourt: CourtState = {
        ...court,
        status: "completed",
        completedAt:
          gameResult.completedAt,
        scoreA: gameResult.scoreA,
        scoreB: gameResult.scoreB,
        draftScoreA: null,
        draftScoreB: null,
        winnerIds:
          gameResult.winnerIds,
        loserIds:
          gameResult.loserIds,
      };

      state.courts[courtIndex] =
        completedCourt;

      const records:
        Record<string, PlayerRecord> = {};

      Object.entries(
        state.playerStats ?? {}
      ).forEach(([id, stats]) => {
        records[id] = {
          playerId: stats.playerId,
          name: stats.name,
          gamesPlayed:
            stats.gamesPlayed,
          wins: stats.wins,
          losses: stats.losses,
          pointsFor:
            stats.pointsFor,
          pointsAgainst:
            stats.pointsAgainst,
        };
      });

      const updatedRecords =
        updatePlayerRecords(
          records,
          gameResult
        );

      Object.entries(
        updatedRecords
      ).forEach(([id, record]) => {
        state.playerStats[id] = {
          playerId: record.playerId,
          name: record.name,
          gamesPlayed:
            record.gamesPlayed,
          wins: record.wins,
          losses: record.losses,
          pointsFor:
            record.pointsFor,
          pointsAgainst:
            record.pointsAgainst,
        };
      });

      // Update only the history entry for this exact game.
      // With independent court rotation, different courts
      // can belong to different cycle/history entries.
      for (
        let i = state.cycles.length - 1;
        i >= 0;
        i--
      ) {
        const historyCourtIndex =
          (state.cycles[i].courts ?? [])
            .findIndex(
              (item) =>
                item.courtNumber === courtNumber &&
                item.startedAt === court.startedAt
            );

        if (historyCourtIndex >= 0) {
          state.cycles[i].courts[
            historyCourtIndex
          ] = completedCourt;

          const allCompleted =
            state.cycles[i].courts.every(
              (item) =>
                item.status === "completed"
            );

          state.cycles[i].completedAt =
            allCompleted
              ? gameResult.completedAt
              : null;
          break;
        }
      }

      if (
        state.endsAt &&
        Date.now() >= state.endsAt
      ) {
        state.status = "finished";
      }

      failureMessage = null;
      return state;
    }
  );

  if (!result.committed) {
    throw new Error(
      failureMessage ??
      `Court ${courtNumber} could not be finished because the game changed. Please try again.`
    );
  }
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
// FIXED PAIRS
// ------------------------------------------------------

/*
 * Maps each paired player to their fixed partner,
 * in both directions.
 */
type FixedPartnerMap = Map<string, string>;

function buildFixedPartnerMap(
  state: OpenPlayState
): FixedPartnerMap {
  const partners: FixedPartnerMap =
    new Map();

  for (
    const pair of
      state.fixedPairs ?? []
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

function chooseBestTeamPairing(
  players: QueuePlayer[],
  partnerHistory: PairHistory,
  opponentHistory: PairHistory,
  fixedPartners: FixedPartnerMap
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
  opponentHistory: PairHistory,
  fixedPartners: FixedPartnerMap
): QueuePlayer[] {
  if (availablePlayers.length < 4) {
    return [];
  }

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
        fixedPartners
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
  await runTransaction(
    gameRef(),
    (current) => {
      const state =
        current as OpenPlayState | null;

      if (
        !state ||
        state.status !== "active"
      ) {
        return;
      }

      if (
        state.endsAt &&
        Date.now() >= state.endsAt
      ) {
        state.status = "finished";
        return state;
      }

      const completedCourt =
        state.courts.find(
          (court) =>
            court.status === "completed"
        );

      if (!completedCourt) {
        return;
      }

      const courtIndex =
        state.courts.findIndex(
          (court) =>
            court.courtNumber ===
            completedCourt.courtNumber
        );

      const otherPlayingIds =
        new Set(
          state.courts
            .filter(
              (court) =>
                court.courtNumber !==
                  completedCourt.courtNumber &&
                court.status === "playing"
            )
            .flatMap(
              (court) =>
                court.players.map(
                  (player) => player.id
                )
            )
        );

      const rotationMap =
        new Map<string, QueuePlayer>();

      for (
        const player of
          state.waitingPlayers ?? []
      ) {
        if (
          !otherPlayingIds.has(player.id)
        ) {
          rotationMap.set(
            player.id,
            player
          );
        }
      }

      for (
        const player of
          completedCourt.players
      ) {
        if (
          !otherPlayingIds.has(player.id) &&
          !rotationMap.has(player.id)
        ) {
          rotationMap.set(
            player.id,
            player
          );
        }
      }

      const rotationQueue =
        Array.from(
          rotationMap.values()
        );

      if (rotationQueue.length < 4) {
        return;
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

      const nextCourtPlayers =
        chooseFairCourtPlayers(
          rotationQueue,
          state,
          queuePosition,
          partnerHistory,
          opponentHistory,
          buildFixedPartnerMap(state)
        );

      if (
        nextCourtPlayers.length !== 4
      ) {
        return;
      }

      const selectedIds =
        new Set(
          nextCourtPlayers.map(
            (player) => player.id
          )
        );

      const nextWaitingPlayers =
        rotationQueue.filter(
          (player) =>
            !selectedIds.has(player.id)
        );

      const startedAt = Date.now();

      state.cycleNumber += 1;

      const nextCourt: CourtState = {
        courtNumber:
          completedCourt.courtNumber,
        players:
          nextCourtPlayers,
        status: "playing",
        startedAt,
        completedAt: null,
        scoreA: null,
        scoreB: null,
        draftScoreA: null,
        draftScoreB: null,
        winnerIds: [],
        loserIds: [],
      };

      state.courts[courtIndex] =
        nextCourt;

      state.waitingPlayers =
        nextWaitingPlayers;

      state.cycles.push({
        cycleNumber:
          state.cycleNumber,
        startedAt,
        completedAt: null,
        courts: [nextCourt],
      });

      return state;
    }
  );
}

// ======================================================
// ADMIN - UPDATE COURT LINEUP
// ======================================================

export async function updateCourtLineup(
  courtNumber: number,
  playerIds: string[]
): Promise<void> {
  if (playerIds.length !== 4) {
    throw new Error(
      "A court must have exactly 4 players."
    );
  }

  if (new Set(playerIds).size !== 4) {
    throw new Error(
      "The same player cannot be selected twice."
    );
  }

  let failureMessage: string | null = null;

  const result = await runTransaction(
    gameRef(),
    (current) => {
      const state =
        current as OpenPlayState | null;

      if (!state) {
        failureMessage =
          "No open play session found.";
        return;
      }

      if (state.status !== "active") {
        failureMessage =
          "Open play is not active.";
        return;
      }

      const courtIndex =
        (state.courts ?? []).findIndex(
          (court) =>
            court.courtNumber === courtNumber
        );

      if (courtIndex === -1) {
        failureMessage =
          `Court ${courtNumber} not found.`;
        return;
      }

      const currentCourt =
        state.courts[courtIndex];

      if (currentCourt.status !== "playing") {
        failureMessage =
          "Only a currently playing court can be edited.";
        return;
      }

      const playerById =
        new Map(
          (state.players ?? []).map(
            (player) => [
              player.id,
              player,
            ]
          )
        );

      const selectedPlayers:
        QueuePlayer[] = [];

      for (const playerId of playerIds) {
        const player =
          playerById.get(playerId);

        if (!player) {
          failureMessage =
            "One of the selected players is no longer part of this session.";
          return;
        }

        selectedPlayers.push(player);
      }

      const otherCourtPlayerIds =
        new Set(
          (state.courts ?? [])
            .filter(
              (court) =>
                court.courtNumber !== courtNumber &&
                court.status === "playing"
            )
            .flatMap(
              (court) =>
                (court.players ?? []).map(
                  (player) => player.id
                )
            )
        );

      for (const player of selectedPlayers) {
        if (
          otherCourtPlayerIds.has(player.id)
        ) {
          failureMessage =
            `${player.name} is already playing on another court. Refresh and choose another player.`;
          return;
        }
      }

      const selectedIdSet =
        new Set(
          selectedPlayers.map(
            (player) => player.id
          )
        );

      const removedPlayers =
        (currentCourt.players ?? [])
          .filter(
            (player) =>
              !selectedIdSet.has(player.id)
          );

      const remainingWaitingPlayers =
        (state.waitingPlayers ?? [])
          .filter(
            (player) =>
              !selectedIdSet.has(player.id)
          );

      const waitingMap =
        new Map<string, QueuePlayer>();

      for (const player of removedPlayers) {
        waitingMap.set(
          player.id,
          player
        );
      }

      for (
        const player of
          remainingWaitingPlayers
      ) {
        if (!waitingMap.has(player.id)) {
          waitingMap.set(
            player.id,
            player
          );
        }
      }

      const previousStartedAt =
        currentCourt.startedAt;

      const updatedCourt: CourtState = {
        ...currentCourt,
        players: selectedPlayers,
        startedAt: Date.now(),
        completedAt: null,
        scoreA: null,
        scoreB: null,
        draftScoreA: null,
        draftScoreB: null,
        winnerIds: [],
        loserIds: [],
      };

      state.waitingPlayers =
        Array.from(
          waitingMap.values()
        );

      state.courts[courtIndex] =
        updatedCourt;

      // Independent court rotation means this court may not
      // live in state.cycleNumber. Update the exact history
      // record for the game being edited.
      for (
        let i = state.cycles.length - 1;
        i >= 0;
        i--
      ) {
        const historyCourtIndex =
          (state.cycles[i].courts ?? [])
            .findIndex(
              (court) =>
                court.courtNumber === courtNumber &&
                court.startedAt === previousStartedAt
            );

        if (historyCourtIndex >= 0) {
          state.cycles[i].courts[
            historyCourtIndex
          ] = updatedCourt;

          state.cycles[i].startedAt =
            updatedCourt.startedAt ??
            state.cycles[i].startedAt;

          state.cycles[i].completedAt =
            null;
          break;
        }
      }

      failureMessage = null;
      return state;
    }
  );

  if (!result.committed) {
    throw new Error(
      failureMessage ??
      "Unable to update the court because another admin changed the session. Refresh and try again."
    );
  }
}

// ======================================================
// FINISH SESSION
// ======================================================

export async function finishOpenPlay(): Promise<void> {
  await runTransaction(
    gameRef(),
    (current) => {
      const state =
        current as OpenPlayState | null;

      if (!state) return;

      if (state.status === "finished") {
        return state;
      }

      state.status = "finished";
      return state;
    }
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

  const guestId =
    `guest_${Date.now()}_${Math.random()
      .toString(36)
      .slice(2, 8)}`;

  let failureMessage: string | null = null;

  const result = await runTransaction(
    gameRef(),
    (current) => {
      const state =
        current as OpenPlayState | null;

      if (!state) {
        failureMessage =
          "No open play session found.";
        return;
      }

      if (state.status !== "active") {
        failureMessage =
          "Open play is not active.";
        return;
      }

      const duplicateName =
        (state.players ?? []).some(
          (player) =>
            player.name.trim().toLowerCase() ===
            cleanName.toLowerCase()
        );

      if (duplicateName) {
        failureMessage =
          "A player with that name is already in this session.";
        return;
      }

      const guestPlayer: QueuePlayer = {
        id: guestId,
        name: cleanName,
        skillLevel,
        joinedAt: Date.now(),
      };

      state.players = [
        ...(state.players ?? []),
        guestPlayer,
      ];

      state.waitingPlayers = [
        ...(state.waitingPlayers ?? []),
        guestPlayer,
      ];

      state.playerStats =
        state.playerStats ?? {};

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

      failureMessage = null;
      return state;
    }
  );

  if (!result.committed) {
    throw new Error(
      failureMessage ??
      "Unable to add guest because the session changed."
    );
  }
}

// ======================================================
// ADMIN - LINK GUEST TO REGISTERED ACCOUNT
// ======================================================

export async function linkGuestPlayerToAccount(
  guestPlayerId: string,
  accountPlayer: QueuePlayer
): Promise<void> {
  if (!guestPlayerId.startsWith("guest_")) {
    throw new Error(
      "Only guest players can be linked."
    );
  }

  let failureMessage: string | null = null;

  const result = await runTransaction(
    gameRef(),
    (current) => {
      const state =
        current as OpenPlayState | null;

      if (!state) {
        failureMessage =
          "No open play session found.";
        return;
      }

      if (state.status !== "active") {
        failureMessage =
          "Open play is not active.";
        return;
      }

      const guestPlayer =
        (state.players ?? []).find(
          (player) =>
            player.id === guestPlayerId
        );

      if (!guestPlayer) {
        failureMessage =
          "Guest player is not part of this session.";
        return;
      }

      if (
        state.players.some(
          (player) =>
            player.id === accountPlayer.id &&
            player.id !== guestPlayerId
        )
      ) {
        failureMessage =
          `${accountPlayer.name} is already part of this session.`;
        return;
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
        (state.waitingPlayers ?? [])
          .map(replacePlayer);

      state.courts =
        (state.courts ?? []).map(
          (court) => ({
            ...court,
            players:
              (court.players ?? [])
                .map(replacePlayer),
            winnerIds:
              (court.winnerIds ?? [])
                .map((id) =>
                  id === guestPlayerId
                    ? accountPlayer.id
                    : id
                ),
            loserIds:
              (court.loserIds ?? [])
                .map((id) =>
                  id === guestPlayerId
                    ? accountPlayer.id
                    : id
                ),
          })
        );

      state.cycles =
        (state.cycles ?? []).map(
          (cycle) => ({
            ...cycle,
            courts:
              (cycle.courts ?? [])
                .map((court) => ({
                  ...court,
                  players:
                    (court.players ?? [])
                      .map(replacePlayer),
                  winnerIds:
                    (court.winnerIds ?? [])
                      .map((id) =>
                        id === guestPlayerId
                          ? accountPlayer.id
                          : id
                      ),
                  loserIds:
                    (court.loserIds ?? [])
                      .map((id) =>
                        id === guestPlayerId
                          ? accountPlayer.id
                          : id
                      ),
                })),
          })
        );

      state.fixedPairs =
        (state.fixedPairs ?? []).map(
          (pair) => ({
            playerA:
              pair.playerA === guestPlayerId
                ? accountPlayer.id
                : pair.playerA,
            playerB:
              pair.playerB === guestPlayerId
                ? accountPlayer.id
                : pair.playerB,
          })
        );

      state.playerStats =
        state.playerStats ?? {};

      const guestStats =
        state.playerStats[guestPlayerId];

      if (guestStats) {
        state.playerStats[
          accountPlayer.id
        ] = {
          ...guestStats,
          playerId: accountPlayer.id,
          name: accountPlayer.name,
        };

        delete state.playerStats[
          guestPlayerId
        ];
      } else {
        state.playerStats[
          accountPlayer.id
        ] = {
          playerId: accountPlayer.id,
          name: accountPlayer.name,
          gamesPlayed: 0,
          wins: 0,
          losses: 0,
          pointsFor: 0,
          pointsAgainst: 0,
        };
      }

      state.playerCount =
        state.players.length;

      failureMessage = null;
      return state;
    }
  );

  if (!result.committed) {
    throw new Error(
      failureMessage ??
      "Unable to link account because the session changed."
    );
  }
}

// ======================================================
// ADMIN - REMOVE PLAYER FROM SESSION
// ======================================================

export async function removePlayerFromSession(
  playerId: string
): Promise<void> {
  let failureMessage: string | null = null;

  const result = await runTransaction(
    gameRef(),
    (current) => {
      const state =
        current as OpenPlayState | null;

      if (!state) {
        failureMessage =
          "No open play session found.";
        return;
      }

      if (state.status !== "active") {
        failureMessage =
          "Open play is not active.";
        return;
      }

      const player =
        (state.players ?? []).find(
          (item) =>
            item.id === playerId
        );

      if (!player) {
        failureMessage =
          "Player is not part of this session.";
        return;
      }

      const playingCourt =
        (state.courts ?? []).find(
          (court) =>
            court.status === "playing" &&
            (court.players ?? []).some(
              (courtPlayer) =>
                courtPlayer.id === playerId
            )
        );

      if (playingCourt) {
        failureMessage =
          `${player.name} is currently playing on Court ${playingCourt.courtNumber}. Edit that court lineup first before removing this player.`;
        return;
      }

      state.players =
        state.players.filter(
          (item) =>
            item.id !== playerId
        );

      state.waitingPlayers =
        (state.waitingPlayers ?? [])
          .filter(
            (item) =>
              item.id !== playerId
          );

      state.playerCount =
        state.players.length;

      state.fixedPairs =
        (state.fixedPairs ?? []).filter(
          (pair) =>
            pair.playerA !== playerId &&
            pair.playerB !== playerId
        );

      // Keep playerStats so completed historical
      // games and rankings remain correct.
      failureMessage = null;
      return state;
    }
  );

  if (!result.committed) {
    throw new Error(
      failureMessage ??
      "Unable to remove player because the session changed."
    );
  }
}

// ======================================================
// ADMIN - FIXED PAIRS
// ======================================================

export async function addFixedPair(
  playerAId: string,
  playerBId: string
): Promise<void> {
  let failureMessage: string | null = null;

  const result = await runTransaction(
    gameRef(),
    (current) => {
      const state =
        current as OpenPlayState | null;

      if (!state) {
        failureMessage =
          "No open play session found.";
        return;
      }

      if (state.status !== "active") {
        failureMessage =
          "Open play is not active.";
        return;
      }

      const players = state.players ?? [];

      const playerA = players.find(
        (player) => player.id === playerAId
      );

      const playerB = players.find(
        (player) => player.id === playerBId
      );

      if (!playerA || !playerB) {
        failureMessage =
          "Both players must be part of this session.";
        return;
      }

      const fixedPairs =
        state.fixedPairs ?? [];

      failureMessage = getFixedPairError(
        fixedPairs,
        playerAId,
        playerBId
      );

      if (failureMessage) {
        return;
      }

      state.fixedPairs = [
        ...fixedPairs,
        {
          playerA: playerAId,
          playerB: playerBId,
        },
      ];

      failureMessage = null;
      return state;
    }
  );

  if (!result.committed) {
    throw new Error(
      failureMessage ??
      "Unable to pair players because the session changed."
    );
  }
}

export async function removeFixedPair(
  playerId: string
): Promise<void> {
  await runTransaction(
    gameRef(),
    (current) => {
      const state =
        current as OpenPlayState | null;

      if (!state) {
        return;
      }

      state.fixedPairs =
        (state.fixedPairs ?? []).filter(
          (pair) =>
            pair.playerA !== playerId &&
            pair.playerB !== playerId
        );

      return state;
    }
  );
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