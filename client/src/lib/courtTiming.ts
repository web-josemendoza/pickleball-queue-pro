import type { CourtState } from "./game";

/*
 * A game running longer than this is flagged so an
 * admin can check on the court.
 */
export const LONG_GAME_MINUTES = 20;

export function getCourtElapsedMs(
  court: CourtState,
  now: number
): number {
  if (
    court.status !== "playing" ||
    !court.startedAt
  ) {
    return 0;
  }

  return Math.max(0, now - court.startedAt);
}

export function isLongGame(
  court: CourtState,
  now: number
): boolean {
  return (
    getCourtElapsedMs(court, now) >=
    LONG_GAME_MINUTES * 60 * 1000
  );
}

// "7:05" or "1:02:05".
export function formatClock(
  milliseconds: number
): string {
  const totalSeconds = Math.max(
    0,
    Math.floor(milliseconds / 1000)
  );

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor(
    (totalSeconds % 3600) / 60
  );
  const seconds = totalSeconds % 60;

  const mm = hours > 0
    ? String(minutes).padStart(2, "0")
    : String(minutes);

  const ss = String(seconds).padStart(2, "0");

  return hours > 0
    ? `${hours}:${mm}:${ss}`
    : `${mm}:${ss}`;
}
