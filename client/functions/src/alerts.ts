/*
 * Works out which players need a push alert after a
 * change to the open-play session. Pure (no Firebase),
 * so it can be tested directly.
 *
 * Mirrors the app's rules: "up next" is the first four
 * waiting players who are not on a break.
 */

export const UP_NEXT_COUNT = 4;

type Player = { id: string; name: string };

type Court = {
  courtNumber: number;
  status: string;
  players?: Player[];
};

export type SessionSnapshot = {
  status?: string;
  courts?: Court[];
  waitingPlayers?: Player[];
  onBreakIds?: string[];
} | null;

export type PlayerAlert = {
  playerId: string;
  kind: "court" | "upNext";
  title: string;
  body: string;
};

type Position = {
  court: number | null;
  upNext: boolean;
};

function positions(
  session: SessionSnapshot
): Map<string, Position> {
  const result = new Map<string, Position>();

  if (!session || session.status !== "active") {
    return result;
  }

  for (const court of session.courts ?? []) {
    if (court.status !== "playing") {
      continue;
    }

    for (const player of court.players ?? []) {
      result.set(player.id, {
        court: court.courtNumber,
        upNext: false,
      });
    }
  }

  const onBreak = new Set(session.onBreakIds ?? []);

  (session.waitingPlayers ?? [])
    .filter((player) => !onBreak.has(player.id))
    .slice(0, UP_NEXT_COUNT)
    .forEach((player) => {
      if (!result.has(player.id)) {
        result.set(player.id, {
          court: null,
          upNext: true,
        });
      }
    });

  return result;
}

// ------------------------------------------------------
// TOURNAMENT
// ------------------------------------------------------

type TournamentMatchSnapshot = {
  stage?: string;
  pool?: number;
  round?: number;
  status?: string;
  court?: number;
  teamA?: string;
  teamB?: string;
};

export type TournamentSnapshot = {
  teams?: Record<
    string,
    { name?: string; members?: { name?: string; playerId?: string }[] }
  >;
  matches?: Record<string, TournamentMatchSnapshot>;
} | null;

function tournamentMatchLabel(
  match: TournamentMatchSnapshot,
  matches: TournamentMatchSnapshot[]
): string {
  if (match.stage === "pool") {
    return `Pool ${String.fromCharCode(65 + (match.pool ?? 0))}`;
  }

  const lastRound = Math.max(
    ...matches.filter((m) => m.stage === "playoff").map((m) => m.round ?? 0)
  );
  const fromEnd = lastRound - (match.round ?? 0);

  return fromEnd === 0 ? "Final" : fromEnd === 1 ? "Semifinal" : fromEnd === 2 ? "Quarterfinal" : "Playoff";
}

/*
 * When a tournament match is called to a court, alert the
 * registered players on both teams. Guests have no account
 * to send to.
 */
export function findTournamentAlerts(
  before: TournamentSnapshot,
  after: TournamentSnapshot
): PlayerAlert[] {
  const teams = after?.teams ?? {};
  const afterMatches = after?.matches ?? {};
  const all = Object.values(afterMatches);
  const alerts: PlayerAlert[] = [];

  for (const [id, match] of Object.entries(afterMatches)) {
    const previous = before?.matches?.[id];

    if (match.status !== "playing" || previous?.status === "playing") {
      continue;
    }

    const nameOf = (teamId?: string) =>
      (teamId && teams[teamId]?.name) || "TBD";
    const label = tournamentMatchLabel(match, all);

    for (const [mine, theirs] of [
      [match.teamA, match.teamB],
      [match.teamB, match.teamA],
    ]) {
      for (const member of (mine ? teams[mine]?.members : undefined) ?? []) {
        if (member.playerId) {
          alerts.push({
            playerId: member.playerId,
            kind: "court",
            title: `Your match is on Court ${match.court}!`,
            body: `${label} vs ${nameOf(theirs)}. Head to your court now.`,
          });
        }
      }
    }
  }

  return alerts;
}

// ------------------------------------------------------
// OPEN PLAY
// ------------------------------------------------------

export function findAlerts(
  before: SessionSnapshot,
  after: SessionSnapshot
): PlayerAlert[] {
  const was = positions(before);
  const now = positions(after);
  const alerts: PlayerAlert[] = [];

  for (const [playerId, position] of now) {
    const previous = was.get(playerId);

    if (
      position.court !== null &&
      position.court !== previous?.court
    ) {
      alerts.push({
        playerId,
        kind: "court",
        title: `You're on Court ${position.court}!`,
        body: "Head to your court now.",
      });
      continue;
    }

    if (position.upNext && !previous?.upNext) {
      alerts.push({
        playerId,
        kind: "upNext",
        title: "You're up next",
        body: "Get ready, you'll be called to a court soon.",
      });
    }
  }

  return alerts;
}
