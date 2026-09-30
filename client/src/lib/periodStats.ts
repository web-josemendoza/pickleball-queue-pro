/*
 * Player stats for a day or a week, added up across every
 * open-play session in that time. Pure, so it can be
 * tested.
 */

import type {
  CourtState,
  OpenPlayState,
  PlayerStats,
} from "./game";
import { rankPlayerStats } from "./playerRanking";

export type StatsPeriod = "session" | "day" | "week";

// Local midnight at the start of the day containing `now`.
export function startOfDay(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

// Local midnight on the Monday of the week containing `now`.
export function startOfWeek(now: Date): Date {
  const day = startOfDay(now);
  const daysSinceMonday = (day.getDay() + 6) % 7;
  day.setDate(day.getDate() - daysSinceMonday);
  return day;
}

export function periodRange(
  period: Exclude<StatsPeriod, "session">,
  now: Date
): { from: Date; to: Date } {
  const from =
    period === "day" ? startOfDay(now) : startOfWeek(now);
  const to = new Date(from);
  to.setDate(to.getDate() + (period === "day" ? 1 : 7));
  return { from, to };
}

function completedGames(session: OpenPlayState): CourtState[] {
  return (session.cycles ?? []).flatMap((cycle) =>
    (cycle.courts ?? []).filter(
      (court) =>
        court.status === "completed" &&
        (court.players ?? []).length === 4 &&
        court.scoreA !== null &&
        court.scoreB !== null
    )
  );
}

/*
 * Every player's games, wins and points from games that
 * finished in [from, to), ranked like the session table.
 * A game counts on the day it finished.
 */
export function statsForRange(
  sessions: OpenPlayState[],
  from: Date,
  to: Date
): PlayerStats[] {
  const totals = new Map<string, PlayerStats>();
  const seenSessions = new Set<string>();

  for (const session of sessions) {
    // The live session may also be in history; count once.
    if (seenSessions.has(session.sessionId)) {
      continue;
    }

    seenSessions.add(session.sessionId);

    for (const game of completedGames(session)) {
      const at = game.completedAt ?? game.startedAt ?? 0;

      if (at < from.getTime() || at >= to.getTime()) {
        continue;
      }

      game.players.forEach((player, index) => {
        const onTeamA = index < 2;
        const scored = onTeamA ? game.scoreA! : game.scoreB!;
        const allowed = onTeamA ? game.scoreB! : game.scoreA!;
        const won = game.winnerIds.includes(player.id);

        const row = totals.get(player.id) ?? {
          playerId: player.id,
          name: player.name,
          gamesPlayed: 0,
          wins: 0,
          losses: 0,
          pointsFor: 0,
          pointsAgainst: 0,
        };

        row.name = player.name;
        row.gamesPlayed += 1;
        row.wins += won ? 1 : 0;
        row.losses += won ? 0 : 1;
        row.pointsFor += scored;
        row.pointsAgainst += allowed;
        totals.set(player.id, row);
      });
    }
  }

  return rankPlayerStats([...totals.values()]);
}

// "Wed, Oct 1" or "Sep 29 – Oct 5".
export function describeRange(
  period: Exclude<StatsPeriod, "session">,
  now: Date
): string {
  const { from, to } = periodRange(period, now);
  const short = (d: Date) =>
    d.toLocaleDateString([], { month: "short", day: "numeric" });

  if (period === "day") {
    return from.toLocaleDateString([], {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  }

  const last = new Date(to);
  last.setDate(last.getDate() - 1);
  return `${short(from)} – ${short(last)}`;
}
