import { useMemo, useState } from "react";

import { formatGameDuration, formatTime } from "../lib/format";
import type { QueuePlayer } from "../lib/queue";

export type CompletedGame = {
  cycleNumber: number;
  courtNumber: number;
  players: QueuePlayer[];
  scoreA: number;
  scoreB: number;
  winnerIds: string[];
  startedAt: number | null;
  completedAt: number | null;
};

type CompletedGamesProps = {
  results: CompletedGame[];
  // Admins get an Edit Score button on each game.
  onEdit?: (result: CompletedGame) => void;
};

export default function CompletedGames({
  results,
  onEdit,
}: CompletedGamesProps) {
  const [showAll, setShowAll] = useState(false);

  const visible = useMemo(
    () => (showAll ? results : results.slice(0, 6)),
    [results, showAll],
  );

  return (
    <div>
      <div className="mb-4">
        <p className="text-xs font-black uppercase tracking-widest text-cyan-400">
          Recent Results
        </p>

        <h3 className="text-xl font-black">Completed Games</h3>
      </div>

      {results.length === 0 ? (
        <div className="rounded-xl bg-slate-900 p-4 text-sm text-slate-400">
          No completed games yet.
        </div>
      ) : (
        <>
          <div className="grid gap-3 lg:grid-cols-2">
            {visible.map((result, index) => {
              const teamA = result.players.slice(0, 2);
              const teamB = result.players.slice(2, 4);

              const teamAWon = result.scoreA > result.scoreB;

              const teamBWon = result.scoreB > result.scoreA;

              return (
                <div
                  key={`${result.cycleNumber}-${result.courtNumber}-${result.completedAt ?? index}`}
                  className="rounded-xl border border-slate-800 bg-slate-900 p-4"
                >
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase tracking-widest text-cyan-400">
                      Cycle {result.cycleNumber} • Court {result.courtNumber}
                    </span>

                    {result.completedAt && (
                      <div className="text-right">
                        {result.completedAt && (
                          <p className="text-[10px] font-bold text-slate-500">
                            {formatTime(result.completedAt)}
                          </p>
                        )}

                        <p className="mt-0.5 text-[10px] font-black text-cyan-500">
                          {formatGameDuration(
                            result.startedAt,
                            result.completedAt,
                          )}
                        </p>
                      </div>
                    )}
                  </div>

                  <div
                    className={`flex items-center justify-between rounded-lg px-3 py-2 ${
                      teamAWon ? "bg-emerald-500/15" : "bg-slate-800"
                    }`}
                  >
                    <span
                      className={`truncate text-sm font-black ${
                        teamAWon ? "text-emerald-300" : "text-white"
                      }`}
                    >
                      {teamAWon && "🏆 "}
                      {teamA.map((player) => player.name).join(" + ")}
                    </span>

                    <span className="ml-3 text-xl font-black">
                      {result.scoreA}
                    </span>
                  </div>

                  <div className="py-1 text-center text-[9px] font-black text-slate-600">
                    VS
                  </div>

                  <div
                    className={`flex items-center justify-between rounded-lg px-3 py-2 ${
                      teamBWon ? "bg-emerald-500/15" : "bg-slate-800"
                    }`}
                  >
                    <span
                      className={`truncate text-sm font-black ${
                        teamBWon ? "text-emerald-300" : "text-white"
                      }`}
                    >
                      {teamBWon && "🏆 "}
                      {teamB.map((player) => player.name).join(" + ")}
                    </span>

                    <span className="ml-3 text-xl font-black">
                      {result.scoreB}
                    </span>
                  </div>

                  {onEdit && (
                    <button
                      type="button"
                      onClick={() => onEdit(result)}
                      className="mt-3 w-full rounded-lg border border-amber-400/40 px-3 py-2 text-xs font-black text-amber-300 transition hover:bg-amber-500/10"
                    >
                      EDIT SCORE
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {results.length > 6 && (
            <button
              type="button"
              onClick={() => setShowAll((current) => !current)}
              className="mt-4 w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm font-black text-white transition hover:bg-slate-800"
            >
              {showAll ? "SHOW LESS" : `SHOW ALL RESULTS (${results.length})`}
            </button>
          )}
        </>
      )}
    </div>
  );
}
