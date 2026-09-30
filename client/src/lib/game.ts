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
  createGameResult,
  updatePlayerRecords,
  type PlayerRecord,
} from "./fourOnFour";

import {
  buildMixRules,
  catchUpCredit,
  chooseBestTeamPairing,
  createPairedInitialCycle,
  pairKey,
  planNextCourt,
} from "./mixer";

import { applyScoreCorrection } from "./scoreCorrection";

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

  /*
   * Players sitting out for now. They keep their
   * place in waitingPlayers but the rotation
   * skips them until they come back.
   */
  onBreakIds?: string[];

  // Prefer evenly matched teams by skill level.
  skillBalance?: boolean;

  // Players who should never be teammates
  // (they can still be opponents).
  keepApartPairs?: FixedPair[];

  /*
   * Games credited for fairness only (never stats) to
   * players who were on a break or arrived late, so they
   * rejoin the rotation instead of catching up game after
   * game. See catchUpCredit in mixer.ts.
   */
  gamesCredit?: Record<string, number>;
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
 * Fixed and keep-apart pairs set up before a
 * session starts.
 * startOpenPlay moves them into the session.
 */
function pendingPairRulesRef() {
  return ref(
    db,
    "openPlay/pendingPairRules"
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

export async function startOpenPlay(
  playerCount: number,
  courtCount: number,
  durationHours: number,
  players: QueuePlayer[],
  {
    fixedPairs = [],
    keepApartPairs = [],
    skillBalance = false,
  }: {
    fixedPairs?: FixedPair[];
    keepApartPairs?: FixedPair[];
    skillBalance?: boolean;
  } = {}
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

  const bothJoined = (pair: FixedPair) =>
    playerIds.has(pair.playerA) &&
    playerIds.has(pair.playerB);

  const sessionPairs =
    fixedPairs.filter(bothJoined);

  const sessionKeepApart =
    keepApartPairs.filter(bothJoined);

  const cycle =
    createPairedInitialCycle(
      players,
      courtCount,
      sessionPairs,
      sessionKeepApart
    );

  const rules = buildMixRules(
    sessionPairs,
    sessionKeepApart,
    skillBalance
  );

  // No history yet, so this only applies the
  // admin's rules (pairs, keep-apart, skill).
  // With no rules it keeps the queue order.
  const courts =
    cycle.courts.map(
      (court) =>
        convertCourt(
          {
            ...court,
            players: chooseBestTeamPairing(
              court.players,
              new Map(),
              new Map(),
              rules
            ),
          },
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

  state.skillBalance =
    skillBalance;

  state.keepApartPairs =
    sessionKeepApart;

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
    pendingPairRulesRef()
  );
}

// ======================================================
// PAIR RULES (FIXED PAIRS AND KEEP-APART)
// ======================================================

export type PairKind =
  | "fixed"
  | "keepApart";

export interface PairRules {
  fixedPairs: FixedPair[];
  keepApartPairs: FixedPair[];
}

const PAIR_RULE_FIELD: Record<
  PairKind,
  keyof PairRules
> = {
  fixed: "fixedPairs",
  keepApart: "keepApartPairs",
};

function samePair(
  pair: FixedPair,
  playerAId: string,
  playerBId: string
): boolean {
  return (
    pairKey(pair.playerA, pair.playerB) ===
    pairKey(playerAId, playerBId)
  );
}

/*
 * Returns an error message when the new pair is not
 * allowed, or null when it is fine.
 */
function getPairRuleError(
  kind: PairKind,
  rules: PairRules,
  playerAId: string,
  playerBId: string
): string | null {
  if (!playerAId || !playerBId) {
    return "Choose two players.";
  }

  if (playerAId === playerBId) {
    return "Choose two different players.";
  }

  const isFixed = rules.fixedPairs.some(
    (pair) =>
      samePair(pair, playerAId, playerBId)
  );

  const isKeptApart =
    rules.keepApartPairs.some((pair) =>
      samePair(pair, playerAId, playerBId)
    );

  if (kind === "keepApart") {
    if (isKeptApart) {
      return "These players are already kept apart.";
    }

    if (isFixed) {
      return "These players are a fixed pair. Unpair them first.";
    }

    return null;
  }

  if (isKeptApart) {
    return "These players are set to be kept apart. Remove that first.";
  }

  const alreadyPaired = [
    playerAId,
    playerBId,
  ].some((id) =>
    rules.fixedPairs.some(
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

function normalizePairRules(
  value: Partial<PairRules> | null
): PairRules {
  return {
    fixedPairs: value?.fixedPairs ?? [],
    keepApartPairs:
      value?.keepApartPairs ?? [],
  };
}

// ------------------------------------------------------
// BEFORE A SESSION
// ------------------------------------------------------

export function subscribeToPendingPairRules(
  callback: (rules: PairRules) => void
): () => void {
  return onValue(
    pendingPairRulesRef(),
    (snapshot) => {
      callback(
        normalizePairRules(snapshot.val())
      );
    }
  );
}

export async function addPendingPair(
  kind: PairKind,
  playerAId: string,
  playerBId: string
): Promise<void> {
  let failureMessage: string | null = null;

  const result = await runTransaction(
    pendingPairRulesRef(),
    (current) => {
      const rules =
        normalizePairRules(current);

      failureMessage = getPairRuleError(
        kind,
        rules,
        playerAId,
        playerBId
      );

      if (failureMessage) {
        return;
      }

      const field = PAIR_RULE_FIELD[kind];

      rules[field] = [
        ...rules[field],
        {
          playerA: playerAId,
          playerB: playerBId,
        },
      ];

      return rules;
    }
  );

  if (!result.committed) {
    throw new Error(
      failureMessage ??
      "Unable to save. Please try again."
    );
  }
}

export async function removePendingPair(
  kind: PairKind,
  pair: FixedPair
): Promise<void> {
  await runTransaction(
    pendingPairRulesRef(),
    (current) => {
      const rules =
        normalizePairRules(current);

      const field = PAIR_RULE_FIELD[kind];

      rules[field] = rules[field].filter(
        (item) =>
          !samePair(
            item,
            pair.playerA,
            pair.playerB
          )
      );

      return rules;
    }
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
        onBreakIds: raw.onBreakIds ?? [],
        skillBalance: raw.skillBalance ?? false,
        keepApartPairs: raw.keepApartPairs ?? [],
        gamesCredit: raw.gamesCredit ?? {},
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

      const plan = planNextCourt(
        state,
        completedCourt
      );

      if (!plan) {
        return;
      }

      const nextCourtPlayers =
        plan.players;

      const nextWaitingPlayers =
        plan.waitingPlayers;

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

      // A late arrival joins the normal rotation rather
      // than playing every game until level with others.
      state.gamesCredit = {
        ...(state.gamesCredit ?? {}),
        [guestId]: catchUpCredit(state, guestId),
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

      const relinkPair = (
        pair: FixedPair
      ): FixedPair => ({
        playerA:
          pair.playerA === guestPlayerId
            ? accountPlayer.id
            : pair.playerA,
        playerB:
          pair.playerB === guestPlayerId
            ? accountPlayer.id
            : pair.playerB,
      });

      state.fixedPairs =
        (state.fixedPairs ?? []).map(
          relinkPair
        );

      state.keepApartPairs =
        (state.keepApartPairs ?? []).map(
          relinkPair
        );

      state.onBreakIds =
        (state.onBreakIds ?? []).map(
          (id) =>
            id === guestPlayerId
              ? accountPlayer.id
              : id
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

      if (state.gamesCredit?.[guestPlayerId] !== undefined) {
        state.gamesCredit = {
          ...state.gamesCredit,
          [accountPlayer.id]: state.gamesCredit[guestPlayerId],
        };
        delete state.gamesCredit[guestPlayerId];
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

      state.onBreakIds =
        (state.onBreakIds ?? []).filter(
          (id) => id !== playerId
        );

      state.keepApartPairs =
        (state.keepApartPairs ?? []).filter(
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
// ADMIN - CORRECT A FINISHED GAME'S SCORE
// ======================================================

export async function correctGameScore(
  courtNumber: number,
  startedAt: number | null,
  scoreA: number,
  scoreB: number
): Promise<void> {
  let failureMessage: string | null = null;

  const result = await runTransaction(
    gameRef(),
    (current) => {
      const state =
        current as OpenPlayState | null;

      if (!state || state.status === "setup") {
        failureMessage =
          "No open play session found.";
        return;
      }

      try {
        failureMessage = null;

        return applyScoreCorrection(
          state,
          courtNumber,
          startedAt,
          scoreA,
          scoreB
        );
      } catch (error) {
        failureMessage =
          error instanceof Error
            ? error.message
            : "Unable to correct the score.";
        return;
      }
    }
  );

  if (!result.committed) {
    throw new Error(
      failureMessage ??
      "Unable to correct the score because the session changed."
    );
  }
}

// ======================================================
// ADMIN - SKILL BALANCE
// ======================================================

export async function setSkillBalance(
  enabled: boolean
): Promise<void> {
  await runTransaction(
    gameRef(),
    (current) => {
      const state =
        current as OpenPlayState | null;

      if (!state || state.status !== "active") {
        return;
      }

      state.skillBalance = enabled;
      return state;
    }
  );
}

// ======================================================
// PLAYER BREAKS
// ======================================================

export async function setPlayerBreak(
  playerId: string,
  onBreak: boolean
): Promise<void> {
  let failureMessage: string | null = null;

  const result = await runTransaction(
    gameRef(),
    (current) => {
      const state =
        current as OpenPlayState | null;

      if (!state || state.status !== "active") {
        failureMessage =
          "Open play is not active.";
        return;
      }

      const player = (state.players ?? []).find(
        (item) => item.id === playerId
      );

      if (!player) {
        failureMessage =
          "Player is not part of this session.";
        return;
      }

      const others = (
        state.onBreakIds ?? []
      ).filter((id) => id !== playerId);

      // Going on break mid-game is fine: it takes
      // effect once their current court finishes.
      state.onBreakIds = onBreak
        ? [...others, playerId]
        : others;

      // Coming back: forgive the games missed on the break.
      if (!onBreak) {
        state.gamesCredit = {
          ...(state.gamesCredit ?? {}),
          [playerId]: catchUpCredit(state, playerId),
        };
      }

      failureMessage = null;
      return state;
    }
  );

  if (!result.committed) {
    throw new Error(
      failureMessage ??
      "Unable to update break status. Please try again."
    );
  }
}

// ======================================================
// ADMIN - PAIR RULES DURING A SESSION
// ======================================================

export async function addSessionPair(
  kind: PairKind,
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

      const sessionIds = new Set(
        (state.players ?? []).map(
          (player) => player.id
        )
      );

      if (
        !sessionIds.has(playerAId) ||
        !sessionIds.has(playerBId)
      ) {
        failureMessage =
          "Both players must be part of this session.";
        return;
      }

      const rules = normalizePairRules(state);

      failureMessage = getPairRuleError(
        kind,
        rules,
        playerAId,
        playerBId
      );

      if (failureMessage) {
        return;
      }

      const field = PAIR_RULE_FIELD[kind];

      state[field] = [
        ...rules[field],
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
      "Unable to save because the session changed."
    );
  }
}

export async function removeSessionPair(
  kind: PairKind,
  pair: FixedPair
): Promise<void> {
  await runTransaction(
    gameRef(),
    (current) => {
      const state =
        current as OpenPlayState | null;

      if (!state) {
        return;
      }

      const field = PAIR_RULE_FIELD[kind];

      state[field] = (
        state[field] ?? []
      ).filter(
        (item) =>
          !samePair(
            item,
            pair.playerA,
            pair.playerB
          )
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