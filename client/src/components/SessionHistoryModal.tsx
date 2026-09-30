import { useState } from "react";

import {
  deleteArchivedSession,
  getRankedPlayers,
  type ArchivedOpenPlaySession,
} from "../lib/game";
import {
  formatDurationMs,
  formatGameDuration,
  formatSessionDate,
  formatSessionTime,
  formatTime,
} from "../lib/format";

type SessionHistoryModalProps = {
  sessions: ArchivedOpenPlaySession[];
  onClose: () => void;
};

export default function SessionHistoryModal({
  sessions,
  onClose,
}: SessionHistoryModalProps) {
  const [selected, setSelected] = useState<ArchivedOpenPlaySession | null>(
    null,
  );

  const handleDelete = async (sessionId: string) => {
    const confirmed = window.confirm("Delete this archived session?");

    if (!confirmed) return;

    try {
      await deleteArchivedSession(sessionId);
      setSelected(null);
    } catch (error) {
      console.error("Failed to delete archived session:", error);

      alert("Failed to delete session.");
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/80 p-4">
      <div className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white text-slate-950 shadow-2xl">
        {/* HEADER */}
        <div className="flex items-start justify-between border-b border-slate-200 p-6">
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-cyan-600">
              Admin
            </p>

            <h2 className="mt-1 text-2xl font-black">Past Sessions</h2>

            <p className="mt-1 text-sm text-slate-500">
              View completed open-play sessions and results.
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              setSelected(null);
              onClose();
            }}
            className="rounded-lg bg-slate-100 px-3 py-2 font-black text-slate-500 hover:bg-slate-200"
          >
            ✕
          </button>
        </div>

        {/* CONTENT */}
        <div className="overflow-y-auto p-6">
          {selected ? (
            (() => {
              const session = selected;

              const archivedRankedPlayers = getRankedPlayers(session);

              const archivedResults = session.cycles
                .flatMap((cycle) =>
                  cycle.courts
                    .filter(
                      (court) =>
                        court.status === "completed" &&
                        court.scoreA !== null &&
                        court.scoreB !== null,
                    )
                    .map((court) => ({
                      cycleNumber: cycle.cycleNumber,
                      courtNumber: court.courtNumber,
                      players: court.players,
                      scoreA: court.scoreA as number,
                      scoreB: court.scoreB as number,
                      startedAt: court.startedAt,
                      completedAt: court.completedAt,
                    })),
                )
                .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0));

              const archivedDurations = archivedResults
                .map((result) => {
                  if (!result.startedAt || !result.completedAt) {
                    return 0;
                  }

                  return Math.max(0, result.completedAt - result.startedAt);
                })
                .filter((duration) => duration > 0);

              const archivedTotalDuration = archivedDurations.reduce(
                (total, duration) => total + duration,
                0,
              );

              const archivedCycleCount = new Set(
                archivedResults.map((result) => result.cycleNumber),
              ).size;

              const archivedAverageDuration =
                archivedDurations.length > 0
                  ? archivedTotalDuration / archivedDurations.length
                  : 0;

              const archivedLongestDuration =
                archivedDurations.length > 0
                  ? Math.max(...archivedDurations)
                  : 0;

              return (
                <div className="space-y-6">
                  <button
                    type="button"
                    onClick={() => setSelected(null)}
                    className="text-sm font-black text-cyan-600 hover:text-cyan-700"
                  >
                    ← BACK TO SESSIONS
                  </button>

                  {/* SESSION HEADER */}
                  <div className="rounded-2xl bg-slate-950 p-6 text-white">
                    <p className="text-xs font-black uppercase tracking-widest text-cyan-400">
                      Archived Session
                    </p>

                    <div className="mt-2 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                      <div>
                        <h3 className="text-2xl font-black sm:text-3xl">
                          {formatSessionDate(session.startedAt)}
                        </h3>

                        <p className="mt-2 text-sm text-slate-400">
                          {session.playerCount} Players · {session.courtCount}{" "}
                          {session.courtCount === 1 ? "Court" : "Courts"} ·{" "}
                          {session.durationHours}{" "}
                          {session.durationHours === 1 ? "Hour" : "Hours"}
                        </p>

                        <p className="mt-1 text-sm text-slate-500">
                          {formatSessionTime(session.startedAt)} –{" "}
                          {formatSessionTime(session.endsAt)}
                        </p>
                      </div>

                      {archivedRankedPlayers[0] && (
                        <div className="rounded-xl bg-amber-400 px-4 py-3 text-slate-950">
                          <p className="text-[10px] font-black uppercase tracking-widest">
                            Session Winner
                          </p>

                          <p className="mt-1 text-lg font-black">
                            🥇 {archivedRankedPlayers[0].name}
                          </p>
                        </div>
                      )}
                    </div>

                    {/* SUMMARY CARDS */}
                    <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                      <div className="rounded-xl bg-slate-900 p-4">
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                          Total Games
                        </p>
                        <p className="mt-1 text-2xl font-black">
                          {archivedResults.length}
                        </p>
                      </div>

                      <div className="rounded-xl bg-slate-900 p-4">
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                          Cycles
                        </p>
                        <p className="mt-1 text-2xl font-black">
                          {archivedCycleCount}
                        </p>
                      </div>

                      <div className="rounded-xl bg-slate-900 p-4">
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                          Avg Game
                        </p>
                        <p className="mt-1 text-2xl font-black text-cyan-300">
                          {formatDurationMs(archivedAverageDuration)}
                        </p>
                      </div>

                      <div className="rounded-xl bg-slate-900 p-4">
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                          Longest Game
                        </p>
                        <p className="mt-1 text-2xl font-black text-emerald-300">
                          {formatDurationMs(archivedLongestDuration)}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* FINAL RANKING */}
                  <div>
                    <div className="mb-4">
                      <p className="text-xs font-black uppercase tracking-widest text-cyan-600">
                        Final Ranking
                      </p>

                      <h3 className="text-xl font-black text-slate-950">
                        Performance Breakdown
                      </h3>
                    </div>

                    <div className="overflow-x-auto rounded-xl border border-slate-200">
                      <div className="min-w-[760px]">
                        <div className="grid grid-cols-[48px_1fr_70px_70px_70px_80px_70px_70px_80px] gap-3 bg-slate-950 px-4 py-3 text-xs font-black uppercase tracking-wider text-slate-400">
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

                        {archivedRankedPlayers.map((player, index) => {
                          const winRate =
                            player.gamesPlayed > 0
                              ? Math.round(
                                  (player.wins / player.gamesPlayed) * 100,
                                )
                              : 0;

                          const pointDiff =
                            player.pointsFor - player.pointsAgainst;

                          return (
                            <div
                              key={`archived-stats-${player.playerId}`}
                              className={`grid grid-cols-[48px_1fr_70px_70px_70px_80px_70px_70px_80px] items-center gap-3 border-t border-slate-200 px-4 py-3 text-sm ${
                                index === 0
                                  ? "bg-amber-50"
                                  : index === 1
                                    ? "bg-slate-50"
                                    : index === 2
                                      ? "bg-orange-50"
                                      : "bg-white"
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
                                        : "text-cyan-600"
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

                              <span className="truncate font-bold text-slate-950">
                                {player.name}
                              </span>

                              <span className="text-slate-600">
                                {player.gamesPlayed}
                              </span>

                              <span className="font-black text-emerald-600">
                                {player.wins}
                              </span>

                              <span className="text-red-500">
                                {player.losses}
                              </span>

                              <span className="font-bold text-slate-950">
                                {winRate}%
                              </span>

                              <span className="text-slate-600">
                                {player.pointsFor}
                              </span>

                              <span className="text-slate-600">
                                {player.pointsAgainst}
                              </span>

                              <span
                                className={`font-black ${
                                  pointDiff > 0
                                    ? "text-emerald-600"
                                    : pointDiff < 0
                                      ? "text-red-500"
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

                  {/* COMPLETED GAMES */}
                  <div>
                    <div className="mb-4">
                      <p className="text-xs font-black uppercase tracking-widest text-cyan-600">
                        Results
                      </p>

                      <h3 className="text-xl font-black text-slate-950">
                        Completed Games
                      </h3>
                    </div>

                    {archivedResults.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
                        No completed games were saved for this session.
                      </div>
                    ) : (
                      <div className="grid gap-3 lg:grid-cols-2">
                        {archivedResults.map((result, index) => {
                          const teamA = result.players.slice(0, 2);

                          const teamB = result.players.slice(2, 4);

                          const teamAWon = result.scoreA > result.scoreB;

                          const teamBWon = result.scoreB > result.scoreA;

                          return (
                            <div
                              key={`archived-result-${result.cycleNumber}-${result.courtNumber}-${result.completedAt ?? index}`}
                              className="rounded-xl border border-slate-200 bg-slate-50 p-4"
                            >
                              <div className="mb-3 flex items-center justify-between gap-3">
                                <span className="text-[10px] font-black uppercase tracking-widest text-cyan-600">
                                  Cycle {result.cycleNumber} • Court{" "}
                                  {result.courtNumber}
                                </span>

                                <div className="text-right">
                                  <p className="text-[10px] font-bold text-slate-500">
                                    {formatTime(result.completedAt)}
                                  </p>

                                  <p className="mt-0.5 text-[10px] font-black text-cyan-600">
                                    {formatGameDuration(
                                      result.startedAt,
                                      result.completedAt,
                                    )}
                                  </p>
                                </div>
                              </div>

                              <div
                                className={`flex items-center justify-between gap-3 rounded-lg px-3 py-3 ${
                                  teamAWon ? "bg-emerald-100" : "bg-white"
                                }`}
                              >
                                <span
                                  className={`min-w-0 truncate text-sm font-black ${
                                    teamAWon
                                      ? "text-emerald-700"
                                      : "text-slate-950"
                                  }`}
                                >
                                  {teamAWon && "🏆 "}
                                  {teamA
                                    .map((player) => player.name)
                                    .join(" + ")}
                                </span>

                                <span className="shrink-0 text-xl font-black text-slate-950">
                                  {result.scoreA}
                                </span>
                              </div>

                              <div className="py-1 text-center text-[9px] font-black text-slate-400">
                                VS
                              </div>

                              <div
                                className={`flex items-center justify-between gap-3 rounded-lg px-3 py-3 ${
                                  teamBWon ? "bg-emerald-100" : "bg-white"
                                }`}
                              >
                                <span
                                  className={`min-w-0 truncate text-sm font-black ${
                                    teamBWon
                                      ? "text-emerald-700"
                                      : "text-slate-950"
                                  }`}
                                >
                                  {teamBWon && "🏆 "}
                                  {teamB
                                    .map((player) => player.name)
                                    .join(" + ")}
                                </span>

                                <span className="shrink-0 text-xl font-black text-slate-950">
                                  {result.scoreB}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* DELETE */}
                  <div className="border-t border-slate-200 pt-5">
                    <button
                      type="button"
                      onClick={() => void handleDelete(session.sessionId)}
                      className="w-full rounded-xl border border-red-200 bg-red-50 px-5 py-3 font-black text-red-600 hover:bg-red-100"
                    >
                      DELETE SESSION
                    </button>
                  </div>
                </div>
              );
            })()
          ) : sessions.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center">
              <p className="font-black text-slate-700">No past sessions yet.</p>

              <p className="mt-2 text-sm text-slate-500">
                Completed sessions will appear here after starting a new
                session.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {sessions.map((session) => {
                const totalGames = session.cycles.reduce(
                  (total, cycle) =>
                    total +
                    cycle.courts.filter((court) => court.status === "completed")
                      .length,
                  0,
                );

                const ranked = getRankedPlayers(session);

                const winner = ranked[0];

                return (
                  <div
                    key={session.sessionId}
                    className="rounded-2xl border border-slate-200 p-5"
                  >
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-xs font-black uppercase tracking-widest text-cyan-600">
                          {formatSessionDate(session.startedAt)}
                        </p>

                        <h3 className="mt-1 text-xl font-black">
                          {session.playerCount} Players · {session.courtCount}{" "}
                          {session.courtCount === 1 ? "Court" : "Courts"}
                        </h3>

                        <p className="mt-1 text-sm text-slate-500">
                          {totalGames} Games ·{" "}
                          {formatSessionTime(session.startedAt)} –{" "}
                          {formatSessionTime(session.endsAt)}
                        </p>

                        {winner && (
                          <div className="mt-3 inline-flex rounded-full bg-amber-100 px-3 py-1 text-xs font-black text-amber-700">
                            🥇 {winner.name}
                          </div>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => setSelected(session)}
                        className="rounded-xl bg-slate-950 px-5 py-3 text-sm font-black text-white hover:bg-slate-800"
                      >
                        VIEW SESSION
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* FOOTER */}
        <div className="border-t border-slate-200 p-4">
          <button
            type="button"
            onClick={() => {
              setSelected(null);
              onClose();
            }}
            className="w-full rounded-xl bg-slate-950 px-5 py-3 font-black text-white hover:bg-slate-800"
          >
            DONE
          </button>
        </div>
      </div>
    </div>
  );
}
