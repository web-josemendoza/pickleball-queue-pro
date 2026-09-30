import { useMemo, useState } from "react";

import type { OpenPlayState, PlayerStats } from "../lib/game";
import { formatDurationMs } from "../lib/format";
import {
  describeRange,
  periodRange,
  statsForRange,
  type StatsPeriod,
} from "../lib/periodStats";

type SessionStats = {
  totalGames: number;
  totalCycles: number;
  averageDuration: number;
  longestDuration: number;
};

type FinalResultsProps = {
  game: OpenPlayState;
  isAdmin: boolean;
  rankedPlayers: PlayerStats[];
  // Saved sessions plus this one, for day/week totals.
  allSessions: OpenPlayState[];
  sessionStats: SessionStats;
  clearingSession: boolean;
  onKeepPlayers: () => Promise<void>;
  onClearPlayers: () => Promise<void>;
};

// Final ranking and session summary after open play ends.
export default function FinalResults({
  game,
  isAdmin,
  rankedPlayers,
  allSessions,
  sessionStats,
  clearingSession,
  onKeepPlayers,
  onClearPlayers,
}: FinalResultsProps) {
  const [showNewSessionOptions, setShowNewSessionOptions] = useState(false);

  const [period, setPeriod] = useState<StatsPeriod>("session");

  // Day and week are those of this session's last game.
  const referenceDate = useMemo(() => {
    const lastGame = Math.max(
      0,
      ...(game.cycles ?? []).flatMap((cycle) =>
        (cycle.courts ?? []).map((court) => court.completedAt ?? 0)
      )
    );

    return new Date(lastGame || game.startedAt || 0);
  }, [game.cycles, game.startedAt]);

  const rows = useMemo(() => {
    if (period === "session") {
      return rankedPlayers;
    }

    const { from, to } = periodRange(period, referenceDate);
    return statsForRange(allSessions, from, to);
  }, [period, rankedPlayers, allSessions, referenceDate]);

  const periodLabel =
    period === "session"
      ? "This session"
      : `${period === "day" ? "Today" : "This week"} · ${describeRange(period, referenceDate)}`;

  return (
    <section className="rounded-2xl bg-slate-950 p-6 text-white shadow-xl">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-widest text-emerald-400">
            Final Results
          </p>
          <h2 className="mt-1 text-3xl font-black">Open Play Complete</h2>

          <p className="mt-2 text-slate-400">
            {game.playerCount} players · {game.courtCount} courts ·{" "}
            {game.durationHours} hours
          </p>
        </div>

        {/* SESSION SUMMARY */}

        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl bg-slate-900 p-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
              Total Games
            </p>

            <p className="mt-1 text-2xl font-black text-white">
              {sessionStats.totalGames}
            </p>
          </div>

          <div className="rounded-xl bg-slate-900 p-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
              Cycles
            </p>

            <p className="mt-1 text-2xl font-black text-white">
              {sessionStats.totalCycles}
            </p>
          </div>

          <div className="rounded-xl bg-slate-900 p-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
              Avg Game
            </p>

            <p className="mt-1 text-2xl font-black text-cyan-300">
              {formatDurationMs(sessionStats.averageDuration)}
            </p>
          </div>

          <div className="rounded-xl bg-slate-900 p-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
              Longest Game
            </p>

            <p className="mt-1 text-2xl font-black text-emerald-300">
              {formatDurationMs(sessionStats.longestDuration)}
            </p>
          </div>
        </div>
        {isAdmin && (
          <button
            type="button"
            onClick={() => setShowNewSessionOptions(true)}
            disabled={clearingSession}
            className="rounded-xl bg-white px-5 py-3 font-black text-slate-950 transition hover:bg-slate-100 disabled:opacity-50"
          >
            {clearingSession ? "PLEASE WAIT..." : "NEW SESSION"}
          </button>
        )}

        {isAdmin && showNewSessionOptions && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4">
            <div className="w-full max-w-md rounded-2xl bg-white p-6 text-slate-950 shadow-2xl">
              <p className="text-xs font-black uppercase tracking-widest text-cyan-600">
                New Session
              </p>

              <h2 className="mt-2 text-2xl font-black">
                Start another Open Play?
              </h2>

              <p className="mt-2 text-sm leading-6 text-slate-500">
                Choose whether the currently registered players should stay in
                the player pool.
              </p>

              <div className="mt-6 space-y-3">
                <button
                  type="button"
                  onClick={() => void onKeepPlayers()}
                  disabled={clearingSession}
                  className="w-full rounded-xl bg-emerald-500 px-5 py-4 text-left font-black text-white hover:bg-emerald-400 disabled:opacity-50"
                >
                  <span className="block">KEEP PLAYERS</span>

                  <span className="mt-1 block text-xs font-medium opacity-80">
                    Keep all registered players and reset courts, games,
                    ranking, and timer.
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => void onClearPlayers()}
                  disabled={clearingSession}
                  className="w-full rounded-xl bg-red-50 px-5 py-4 text-left font-black text-red-700 hover:bg-red-100 disabled:opacity-50"
                >
                  <span className="block">CLEAR PLAYERS</span>

                  <span className="mt-1 block text-xs font-medium text-red-500">
                    Remove everyone from the current player pool and start
                    fresh.
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowNewSessionOptions(false)}
                  disabled={clearingSession}
                  className="w-full rounded-xl border border-slate-300 px-5 py-3 font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                >
                  CANCEL
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
      {/* PLAYER STATS */}

      <div className="mt-6">
        <div className="mb-4">
          <p className="text-xs font-black uppercase tracking-widest text-cyan-400">
            Player Stats
          </p>

          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h3 className="text-xl font-black text-white">
                Performance Breakdown
              </h3>
              <p className="mt-1 text-sm text-slate-400">{periodLabel}</p>
            </div>

            <div
              role="tablist"
              aria-label="Stats period"
              className="flex rounded-xl bg-slate-900 p-1"
            >
              {(
                [
                  ["session", "Session"],
                  ["day", "Day"],
                  ["week", "Week"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  aria-selected={period === value}
                  onClick={() => setPeriod(value)}
                  className={`rounded-lg px-4 py-2 text-xs font-black uppercase tracking-wider transition ${
                    period === value
                      ? "bg-cyan-500 text-slate-950"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-800">
          <div className="min-w-[760px]">
            {/* HEADER */}
            <div className="grid grid-cols-[48px_1fr_70px_70px_70px_80px_70px_70px_80px] gap-3 bg-slate-900 px-4 py-3 text-xs font-black uppercase tracking-wider text-slate-400">
              <span>#</span>
              <span>Player</span>
              <span>Games</span>
              <span>Wins</span>
              <span>Losses</span>
              <span>Win %</span>
              <span>PF</span>
              <span>PA</span>
              <span>+/-</span>
            </div>

            {rows.length === 0 && (
              <p className="border-t border-slate-800 px-4 py-6 text-center text-sm text-slate-400">
                No games played in this period.
              </p>
            )}

            {rows.map((player, index) => {
              const winRate =
                player.gamesPlayed > 0
                  ? Math.round((player.wins / player.gamesPlayed) * 100)
                  : 0;

              const pointDiff = player.pointsFor - player.pointsAgainst;

              return (
                <div
                  key={`stats-${player.playerId}`}
                  className={`grid grid-cols-[48px_1fr_70px_70px_70px_80px_70px_70px_80px] items-center gap-3 border-t border-slate-800 px-4 py-3 text-sm ${
                    index === 0
                      ? "bg-amber-400/10"
                      : index === 1
                        ? "bg-slate-300/10"
                        : index === 2
                          ? "bg-orange-500/10"
                          : ""
                  }`}
                >
                  <span
                    className={`flex h-8 w-8 items-center justify-center rounded-full font-black ${
                      index === 0
                        ? "bg-amber-400 text-slate-950"
                        : index === 1
                          ? "bg-slate-300 text-slate-950"
                          : index === 2
                            ? "bg-orange-500 text-white"
                            : "text-cyan-400"
                    }`}
                  >
                    {index === 0
                      ? "🥇"
                      : index === 1
                        ? "🥈"
                        : index === 2
                          ? "🥉"
                          : index + 1}
                  </span>

                  <span className="truncate font-bold text-white">
                    {player.name}
                  </span>

                  <span className="text-slate-300">{player.gamesPlayed}</span>

                  <span className="font-black text-emerald-300">
                    {player.wins}
                  </span>

                  <span className="text-red-300">{player.losses}</span>

                  <span className="font-bold text-white">{winRate}%</span>

                  <span className="text-slate-300">{player.pointsFor}</span>

                  <span className="text-slate-300">{player.pointsAgainst}</span>

                  <span
                    className={`font-black ${
                      pointDiff > 0
                        ? "text-emerald-300"
                        : pointDiff < 0
                          ? "text-red-300"
                          : "text-slate-400"
                    }`}
                  >
                    {pointDiff > 0 ? `+${pointDiff}` : pointDiff}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
