import { useEffect, useMemo, useState } from "react";

import {
  subscribeToOpenPlay,
  type CourtState,
  type OpenPlayState,
} from "../lib/game";
import {
  subscribeToQueue,
  type QueuePlayer,
} from "../lib/queue";
import {
  formatClock,
  getCourtElapsedMs,
  isLongGame,
  LONG_GAME_MINUTES,
} from "../lib/courtTiming";

/*
 * Read-only big-screen view for a monitor at the
 * venue. Open the app with ?view=tv.
 */
export default function TvDisplay() {
  const [game, setGame] =
    useState<OpenPlayState | null>(null);

  const [queue, setQueue] =
    useState<QueuePlayer[]>([]);

  const [now, setNow] = useState(() =>
    Date.now()
  );

  useEffect(() => subscribeToOpenPlay(setGame), []);

  useEffect(() => subscribeToQueue(setQueue), []);

  useEffect(() => {
    const timer = window.setInterval(
      () => setNow(Date.now()),
      1000
    );

    return () => window.clearInterval(timer);
  }, []);

  const onBreakIds = useMemo(
    () => new Set(game?.onBreakIds ?? []),
    [game]
  );

  const readyWaiting = useMemo(
    () =>
      (game?.waitingPlayers ?? []).filter(
        (player) => !onBreakIds.has(player.id)
      ),
    [game, onBreakIds]
  );

  const onBreak = useMemo(
    () =>
      (game?.waitingPlayers ?? []).filter(
        (player) => onBreakIds.has(player.id)
      ),
    [game, onBreakIds]
  );

  if (!game || game.status !== "active") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 p-8 text-center text-white">
        <p className="text-lg font-black uppercase tracking-[0.3em] text-cyan-400">
          Pickleball Queue Pro
        </p>

        <h1 className="mt-4 text-5xl font-black sm:text-7xl">
          {game?.status === "finished"
            ? "Open Play Complete"
            : "Open Play Starting Soon"}
        </h1>

        <p className="mt-6 text-2xl font-bold text-slate-400">
          {queue.length} player
          {queue.length === 1 ? "" : "s"} in
          the queue
        </p>
      </div>
    );
  }

  const upNext = readyWaiting.slice(0, 4);
  const later = readyWaiting.slice(4);

  const remainingMs = game.endsAt
    ? game.endsAt - now
    : 0;

  return (
    <div className="min-h-screen bg-slate-950 p-6 text-white lg:p-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-black uppercase tracking-[0.3em] text-cyan-400">
            Pickleball Queue Pro
          </p>
          <h1 className="text-4xl font-black lg:text-5xl">
            Open Play
          </h1>
        </div>

        <div className="text-right">
          <p className="text-sm font-black uppercase tracking-widest text-slate-500">
            Time Left
          </p>
          <p className="text-5xl font-black tabular-nums text-emerald-400 lg:text-6xl">
            {formatClock(remainingMs)}
          </p>
        </div>
      </header>

      <div className="mt-8 grid gap-8 xl:grid-cols-[1fr_380px]">
        <section className="grid gap-6 md:grid-cols-2">
          {game.courts.map((court) => (
            <TvCourt
              key={court.courtNumber}
              court={court}
              now={now}
            />
          ))}
        </section>

        <aside className="space-y-6">
          <div className="rounded-3xl bg-orange-500 p-6 text-slate-950">
            <p className="text-sm font-black uppercase tracking-widest">
              Up Next
            </p>

            {upNext.length === 0 ? (
              <p className="mt-3 text-2xl font-bold">
                Nobody waiting
              </p>
            ) : (
              <ol className="mt-3 space-y-2">
                {upNext.map((player, index) => (
                  <li
                    key={player.id}
                    className="truncate text-3xl font-black"
                  >
                    {index + 1}. {player.name}
                  </li>
                ))}
              </ol>
            )}
          </div>

          {later.length > 0 && (
            <div className="rounded-3xl bg-slate-900 p-6">
              <p className="text-sm font-black uppercase tracking-widest text-slate-400">
                Waiting · {later.length}
              </p>

              <ol className="mt-3 space-y-1">
                {later.map((player, index) => (
                  <li
                    key={player.id}
                    className="truncate text-xl font-bold text-slate-200"
                  >
                    {index + 5}. {player.name}
                  </li>
                ))}
              </ol>
            </div>
          )}

          {onBreak.length > 0 && (
            <div className="rounded-3xl bg-slate-900 p-6">
              <p className="text-sm font-black uppercase tracking-widest text-amber-400">
                On Break
              </p>

              <p className="mt-2 text-xl font-bold text-slate-300">
                {onBreak
                  .map((player) => player.name)
                  .join(", ")}
              </p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function TvCourt({
  court,
  now,
}: {
  court: CourtState;
  now: number;
}) {
  const teamA = court.players.slice(0, 2);
  const teamB = court.players.slice(2, 4);
  const long = isLongGame(court, now);

  return (
    <div
      className={`rounded-3xl p-6 ring-4 ${
        long
          ? "bg-amber-950/60 ring-amber-400"
          : "bg-slate-900 ring-slate-800"
      }`}
    >
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-black">
          Court {court.courtNumber}
        </h2>

        {court.status === "playing" ? (
          <span
            className={`text-3xl font-black tabular-nums ${
              long
                ? "text-amber-300"
                : "text-cyan-300"
            }`}
          >
            {formatClock(
              getCourtElapsedMs(court, now)
            )}
          </span>
        ) : (
          <span className="rounded-full bg-emerald-500/20 px-4 py-1 text-lg font-black text-emerald-300">
            {court.status === "completed"
              ? "FINISHED"
              : "OPEN"}
          </span>
        )}
      </div>

      {long && (
        <p className="mt-1 text-sm font-black uppercase tracking-widest text-amber-300">
          Over {LONG_GAME_MINUTES} min
        </p>
      )}

      <div className="mt-5 space-y-3">
        <TvTeam players={teamA} />
        <p className="text-center text-lg font-black text-slate-500">
          VS
        </p>
        <TvTeam players={teamB} />
      </div>
    </div>
  );
}

function TvTeam({
  players,
}: {
  players: QueuePlayer[];
}) {
  return (
    <div className="rounded-2xl bg-slate-800 px-5 py-4">
      <p className="truncate text-3xl font-black lg:text-4xl">
        {players.length > 0
          ? players
              .map((player) => player.name)
              .join(" & ")
          : "—"}
      </p>
    </div>
  );
}
