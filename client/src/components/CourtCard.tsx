import type { ChangeEvent } from "react";

import type { CourtState } from "../lib/game";
import {
  formatClock,
  getCourtElapsedMs,
  isLongGame,
  LONG_GAME_MINUTES,
} from "../lib/courtTiming";

type CourtCardProps = {
  court: CourtState;
  // Score boxes as typed (not yet submitted).
  score: { a: string; b: string };
  now: number;
  isAdmin: boolean;
  finishing: boolean;
  onEdit: () => void;
  onScoreChange: (team: "a" | "b", value: string) => void;
  onFinish: () => void;
};

export default function CourtCard({
  court,
  score,
  now,
  isAdmin,
  finishing,
  onEdit,
  onScoreChange,
  onFinish,
}: CourtCardProps) {
  const { teamA, teamB } = {
    teamA: court.players.slice(0, 2),
    teamB: court.players.slice(2, 4),
  };
  const teamAWon =
    court.status === "completed" &&
    court.scoreA !== null &&
    court.scoreB !== null &&
    court.scoreA > court.scoreB;
  const teamBWon =
    court.status === "completed" &&
    court.scoreA !== null &&
    court.scoreB !== null &&
    court.scoreB > court.scoreA;

  const longGame = isLongGame(court, now);

  return (
    <section
      key={court.courtNumber}
      className={`rounded-2xl border bg-slate-900 p-5 shadow-xl ${
        longGame ? "border-amber-400" : "border-slate-700"
      }`}
    >
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-cyan-400">
            Court {court.courtNumber}
          </p>
          <h2 className="text-2xl font-black text-white">
            {court.status === "completed" ? "Game Complete" : "Game On"}
          </h2>
        </div>

        <div className="flex flex-col items-end gap-1">
          <span
            className={`rounded-full px-3 py-1 text-xs font-bold ${
              court.status === "completed"
                ? "bg-emerald-500/20 text-emerald-300"
                : "bg-cyan-500/20 text-cyan-300"
            }`}
          >
            {court.status.toUpperCase()}
          </span>

          {court.status === "playing" && (
            <span
              className={`text-sm font-black tabular-nums ${
                longGame ? "text-amber-300" : "text-slate-400"
              }`}
            >
              ⏱ {formatClock(getCourtElapsedMs(court, now))}
            </span>
          )}
        </div>
      </div>

      {longGame && (
        <p className="-mt-2 mb-4 rounded-xl bg-amber-500/15 px-4 py-2 text-sm font-bold text-amber-200">
          This game has run over {LONG_GAME_MINUTES} minutes. Check that the
          score was entered.
        </p>
      )}

      {isAdmin && court.status === "playing" && (
        <button
          type="button"
          onClick={() => onEdit()}
          className="mb-4 w-full rounded-xl border border-amber-400/40 bg-amber-500/10 px-4 py-3 text-sm font-black text-amber-300 transition hover:bg-amber-500/20"
        >
          EDIT PLAYERS & TEAMS
        </button>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <div
          className={`rounded-xl border p-4 ${
            teamAWon
              ? "border-emerald-500/60 bg-emerald-500/10"
              : "border-slate-700 bg-slate-950/50"
          }`}
        >
          <div className="mb-3 flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Team A
            </span>
            {teamAWon && (
              <span className="text-xs font-bold text-emerald-300">WINNER</span>
            )}
          </div>

          <div className="space-y-2">
            {teamA.map((player) => (
              <div
                key={player.id}
                className="rounded-lg bg-slate-800 px-3 py-3 font-semibold text-white"
              >
                {player.name}
              </div>
            ))}
          </div>

          {court.status === "playing" ? (
            <input
              type="number"
              min="0"
              value={score.a}
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                onScoreChange("a", event.target.value)
              }
              placeholder="Score"
              className="mt-4 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-4 text-center text-3xl font-black text-white outline-none focus:border-cyan-400"
            />
          ) : (
            <div className="mt-4 rounded-xl bg-slate-950 px-4 py-4 text-center text-3xl font-black text-white">
              {court.scoreA ?? 0}
            </div>
          )}
        </div>

        <div
          className={`rounded-xl border p-4 ${
            teamBWon
              ? "border-emerald-500/60 bg-emerald-500/10"
              : "border-slate-700 bg-slate-950/50"
          }`}
        >
          <div className="mb-3 flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Team B
            </span>
            {teamBWon && (
              <span className="text-xs font-bold text-emerald-300">WINNER</span>
            )}
          </div>

          <div className="space-y-2">
            {teamB.map((player) => (
              <div
                key={player.id}
                className="rounded-lg bg-slate-800 px-3 py-3 font-semibold text-white"
              >
                {player.name}
              </div>
            ))}
          </div>

          {court.status === "playing" ? (
            <input
              type="number"
              min="0"
              value={score.b}
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                onScoreChange("b", event.target.value)
              }
              placeholder="Score"
              className="mt-4 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-4 text-center text-3xl font-black text-white outline-none focus:border-cyan-400"
            />
          ) : (
            <div className="mt-4 rounded-xl bg-slate-950 px-4 py-4 text-center text-3xl font-black text-white">
              {court.scoreB ?? 0}
            </div>
          )}
        </div>
      </div>

      {court.status === "playing" && (
        <button
          type="button"
          disabled={finishing}
          onClick={() => void onFinish()}
          className="mt-4 w-full rounded-xl bg-emerald-500 px-5 py-4 font-black text-white transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {finishing ? "SAVING RESULT..." : `FINISH COURT ${court.courtNumber}`}
        </button>
      )}
    </section>
  );
}
