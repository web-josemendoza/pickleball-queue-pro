/*
 * Firebase storage for the current tournament. All match
 * changes run in transactions so two phones reporting at
 * the same moment can't overwrite each other.
 */

import {
  onValue,
  ref,
  remove,
  runTransaction,
  set,
} from "firebase/database";

import { db } from "./firebase";
import {
  correctResult,
  DEFAULT_SETTINGS,
  normalizeTournament,
  recordResult,
  startTournament,
  type Tournament,
  type TournamentSettings,
  type TournamentTeam,
} from "./tournament";

const PATH = "tournament/current";
const HISTORY_PATH = "tournament/history";

function tournamentRef() {
  return ref(db, PATH);
}

export interface ArchivedTournament extends Tournament {
  archivedAt: number;
}

// Firebase rejects undefined values.
function clean<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function subscribeToTournament(
  callback: (tournament: Tournament | null) => void
): () => void {
  return onValue(tournamentRef(), (snapshot) => {
    callback(normalizeTournament(snapshot.val()));
  });
}

/*
 * Runs a change against the latest tournament. `change`
 * returns the new tournament or throws a message for the
 * user.
 */
async function update(
  change: (current: Tournament) => Tournament
): Promise<Tournament | null> {
  let failure: string | null = null;

  const result = await runTransaction(tournamentRef(), (raw) => {
    const current = normalizeTournament(raw);

    if (!current) {
      failure = "No tournament found.";
      return;
    }

    try {
      failure = null;
      return clean(change(current));
    } catch (error) {
      failure =
        error instanceof Error ? error.message : String(error);
      return;
    }
  });

  if (!result.committed) {
    throw new Error(
      failure ?? "The tournament changed. Please try again."
    );
  }

  return normalizeTournament(result.snapshot.val());
}

async function updateOnly(
  change: (current: Tournament) => Tournament
): Promise<void> {
  await update(change);
}

// ------------------------------------------------------
// HISTORY
// ------------------------------------------------------

/*
 * Copies a finished tournament into history. Safe to repeat:
 * a corrected final just overwrites the saved copy.
 */
export async function saveToHistory(t: Tournament): Promise<void> {
  if (t.status !== "finished") {
    throw new Error("Only finished tournaments go into history.");
  }

  const archived: ArchivedTournament = { ...t, archivedAt: Date.now() };
  await set(ref(db, `${HISTORY_PATH}/${t.id}`), clean(archived));
}

// Saves once play is over; failures don't undo the result.
async function saveIfFinished(t: Tournament | null) {
  if (t?.status !== "finished") {
    return;
  }

  try {
    await saveToHistory(t);
  } catch (error) {
    console.error("Unable to save tournament to history:", error);
  }
}

export function subscribeToTournamentHistory(
  callback: (tournaments: ArchivedTournament[]) => void
): () => void {
  return onValue(ref(db, HISTORY_PATH), (snapshot) => {
    const raw = (snapshot.val() ?? {}) as Record<string, ArchivedTournament>;

    const list = Object.entries(raw)
      .map(([id, value]) => {
        const t = normalizeTournament({ ...value, id });
        return t ? { ...t, archivedAt: value.archivedAt ?? t.createdAt } : null;
      })
      .filter((t): t is ArchivedTournament => t !== null)
      .sort((a, b) => b.archivedAt - a.archivedAt);

    callback(list);
  });
}

export function deleteFromHistory(id: string): Promise<void> {
  return remove(ref(db, `${HISTORY_PATH}/${id}`));
}

/*
 * Clears a finished tournament so a new one can be created,
 * saving it to history first.
 */
export async function finishAndClear(t: Tournament): Promise<void> {
  await saveToHistory(t);
  await remove(tournamentRef());
}

// ------------------------------------------------------
// ADMIN - SETUP
// ------------------------------------------------------

export async function createTournament(
  name: string,
  settings: TournamentSettings = DEFAULT_SETTINGS
): Promise<void> {
  const tournament: Tournament = {
    id: `tournament_${Date.now()}`,
    name: name.trim() || "Tournament",
    status: "setup",
    settings,
    teams: {},
    pools: [],
    matches: {},
    championId: null,
    createdAt: Date.now(),
  };

  await set(tournamentRef(), clean(tournament));
}

function requireSetup(t: Tournament) {
  if (t.status !== "setup") {
    throw new Error("Teams and settings are locked once play starts.");
  }
}

export function updateSettings(
  settings: TournamentSettings
): Promise<void> {
  return updateOnly((t) => {
    requireSetup(t);
    return { ...t, settings };
  });
}

export function renameTournament(name: string): Promise<void> {
  return updateOnly((t) => ({ ...t, name: name.trim() || t.name }));
}

// Adds a team at the bottom of the seeding.
export function addTeam(
  members: TournamentTeam["members"],
  name?: string
): Promise<void> {
  return updateOnly((t) => {
    requireSetup(t);

    if (members.length !== 2 || members.some((m) => !m.name.trim())) {
      throw new Error("A team needs two players.");
    }

    const taken = new Set(
      Object.values(t.teams)
        .flatMap((team) => team.members)
        .map((m) => m.playerId ?? `name:${m.name.trim().toLowerCase()}`)
    );

    for (const m of members) {
      const key = m.playerId ?? `name:${m.name.trim().toLowerCase()}`;

      if (taken.has(key)) {
        throw new Error(`${m.name} is already on a team.`);
      }
    }

    const id = `team_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const seed = Object.keys(t.teams).length + 1;

    return {
      ...t,
      teams: {
        ...t.teams,
        [id]: {
          id,
          name: name?.trim() || members.map((m) => m.name.trim()).join(" & "),
          members: members.map((m) => ({
            name: m.name.trim(),
            ...(m.playerId ? { playerId: m.playerId } : {}),
          })),
          seed,
        },
      },
    };
  });
}

export function removeTeam(teamId: string): Promise<void> {
  return updateOnly((t) => {
    requireSetup(t);
    const teams = { ...t.teams };
    delete teams[teamId];
    return { ...t, teams: reseed(Object.values(teams).sort((a, b) => a.seed - b.seed)) };
  });
}

// Renumbers seeds 1..n in the given order.
function reseed(ordered: TournamentTeam[]): Record<string, TournamentTeam> {
  return Object.fromEntries(
    ordered.map((team, index) => [team.id, { ...team, seed: index + 1 }])
  );
}

// Sets the seeding to the given team order (1 = strongest).
export function setSeedOrder(teamIds: string[]): Promise<void> {
  return updateOnly((t) => {
    requireSetup(t);
    const ordered = teamIds
      .map((id) => t.teams[id])
      .filter((team): team is TournamentTeam => !!team);

    if (ordered.length !== Object.keys(t.teams).length) {
      throw new Error("The team list changed. Please try again.");
    }

    return { ...t, teams: reseed(ordered) };
  });
}

export function beginTournament(): Promise<void> {
  return updateOnly((t) => {
    requireSetup(t);
    return startTournament(t, Date.now());
  });
}

export function deleteTournament(): Promise<void> {
  return remove(tournamentRef());
}

// ------------------------------------------------------
// MATCHES
// ------------------------------------------------------

export async function reportMatchResult(
  matchId: string,
  scoreA: number,
  scoreB: number
): Promise<void> {
  await saveIfFinished(
    await update((t) => recordResult(t, matchId, scoreA, scoreB, Date.now()))
  );
}

export async function correctMatchResult(
  matchId: string,
  scoreA: number,
  scoreB: number
): Promise<void> {
  await saveIfFinished(
    await update((t) => correctResult(t, matchId, scoreA, scoreB))
  );
}
