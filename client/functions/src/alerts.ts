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
