/*
 * Display helpers for tournament screens (labels, a
 * player's own team and next match). Pure.
 */

import {
  matchList,
  playoffRoundCount,
  upNextMatches,
  type Tournament,
  type TournamentMatch,
} from "./tournament";

export function poolName(pool: number): string {
  return `Pool ${String.fromCharCode(65 + pool)}`;
}

export function playoffRounds(t: Tournament): number {
  return Math.max(
    0,
    ...matchList(t)
      .filter((m) => m.stage === "playoff")
      .map((m) => m.round ?? 0)
  );
}

export function roundName(round: number, totalRounds: number): string {
  const fromEnd = totalRounds - round;

  if (fromEnd === 0) return "Final";
  if (fromEnd === 1) return "Semifinal";
  if (fromEnd === 2) return "Quarterfinal";
  return `Round ${round}`;
}

export function matchLabel(t: Tournament, m: TournamentMatch): string {
  if (m.stage === "pool") {
    const round = Number(m.id.match(/-r(\d+)-/)?.[1] ?? 0);
    return `${poolName(m.pool ?? 0)} · Round ${round}`;
  }

  return roundName(m.round ?? 1, playoffRounds(t));
}

export function teamName(t: Tournament, teamId: string | null): string {
  if (!teamId) {
    return "TBD";
  }

  return t.teams[teamId]?.name ?? "Unknown team";
}

// The team a signed-in player is on, if any.
export function teamOfPlayer(
  t: Tournament,
  playerId: string | null
): string | null {
  if (!playerId) {
    return null;
  }

  const team = Object.values(t.teams).find((candidate) =>
    candidate.members.some((m) => m.playerId === playerId)
  );

  return team?.id ?? null;
}

export type NextMatchInfo =
  | { kind: "playing"; match: TournamentMatch }
  | { kind: "upNext"; match: TournamentMatch; position: number }
  | { kind: "waiting"; match: TournamentMatch }
  | { kind: "eliminated" }
  | { kind: "champion" }
  | { kind: "none" };

// What a team should know right now.
export function nextMatchFor(
  t: Tournament,
  teamId: string
): NextMatchInfo {
  if (t.championId === teamId) {
    return { kind: "champion" };
  }

  const mine = matchList(t).filter(
    (m) => m.teamA === teamId || m.teamB === teamId
  );

  const playing = mine.find((m) => m.status === "playing");

  if (playing) {
    return { kind: "playing", match: playing };
  }

  const upNext = upNextMatches(t, t.settings.courtCount * 2);
  const index = upNext.findIndex(
    (m) => m.teamA === teamId || m.teamB === teamId
  );

  if (index >= 0) {
    return { kind: "upNext", match: upNext[index], position: index + 1 };
  }

  const waiting = mine.find((m) => m.status === "waiting");

  if (waiting) {
    return { kind: "waiting", match: waiting };
  }

  if (t.status === "playoffs" || t.status === "finished") {
    const inPlayoff = mine.some((m) => m.stage === "playoff");
    const lostPlayoff = mine.some(
      (m) => m.stage === "playoff" && m.status === "done" && m.winner !== teamId
    );

    if (!inPlayoff || lostPlayoff) {
      return { kind: "eliminated" };
    }
  }

  return { kind: "none" };
}

// Rough plan for the setup screen.
export function formatPreview(
  teamCount: number,
  poolCount: number,
  advancePerPool: number
): { poolMatches: number; qualifiers: number; playoffMatches: number } {
  const base = Math.floor(teamCount / Math.max(1, poolCount));
  const extra = teamCount % Math.max(1, poolCount);
  let poolMatches = 0;

  for (let p = 0; p < poolCount; p++) {
    const size = base + (p < extra ? 1 : 0);
    poolMatches += (size * (size - 1)) / 2;
  }

  const qualifiers = Math.min(teamCount, poolCount * advancePerPool);
  const rounds = playoffRoundCount(qualifiers);
  const playoffMatches = qualifiers >= 2 ? qualifiers - 1 : 0;

  return {
    poolMatches,
    qualifiers,
    playoffMatches: rounds > 0 ? playoffMatches : 0,
  };
}
