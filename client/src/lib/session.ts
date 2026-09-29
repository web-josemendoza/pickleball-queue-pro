export type RotationMode = "4_ON_4_OFF";

export type SessionStatus =
  | "setup"
  | "active"
  | "completed";

export interface OpenPlaySession {
  playerCount: number;
  courtCount: number;
  durationHours: number;

  rotationMode: RotationMode;

  startedAt: number | null;
  endsAt: number | null;

  status: SessionStatus;
}

export interface SessionRequirements {
  minimumPlayers: number;
  minimumCourts: number;
  minimumHours: number;
}

export const FOUR_ON_FOUR_OFF_REQUIREMENTS: SessionRequirements = {
  minimumPlayers: 12,
  minimumCourts: 1,
  minimumHours: 1,
};

export function validateSession(
  session: OpenPlaySession
): string[] {
  const errors: string[] = [];

  if (
    !Number.isInteger(session.courtCount) ||
    session.courtCount < 1
  ) {
    errors.push("You need at least 1 court.");
  }

  if (
    !Number.isFinite(session.durationHours) ||
    session.durationHours < 1
  ) {
    errors.push(
      "You need at least 1 hour of open play."
    );
  }

  const requiredPlayers =
    session.courtCount * 4;

  if (
    !Number.isInteger(session.playerCount) ||
    session.playerCount < requiredPlayers
  ) {
    errors.push(
      `You need at least ${requiredPlayers} players for ${session.courtCount} court${
        session.courtCount === 1 ? "" : "s"
      }.`
    );
  }

  return errors;
}

export function calculateSessionEndTime(
  startedAt: number,
  durationHours: number
): number {
  return (
    startedAt +
    durationHours * 60 * 60 * 1000
  );
}

export function getSessionRemainingMs(
  session: OpenPlaySession,
  now: number = Date.now()
): number {
  if (!session.endsAt) {
    return 0;
  }

  return Math.max(0, session.endsAt - now);
}

export function isSessionFinished(
  session: OpenPlaySession,
  now: number = Date.now()
): boolean {
  if (!session.endsAt) {
    return false;
  }

  return now >= session.endsAt;
}