import type { QueuePlayer } from "../lib/queue";

type PlayerQueuePanelProps = {
  isAdmin: boolean;
  registeredPlayerCount: number;
  onCourtPlayers: QueuePlayer[];
  upNextPlayers: QueuePlayer[];
  laterWaitingPlayers: QueuePlayer[];
  onBreakPlayers: QueuePlayer[];
  statsPlayerOptions: { id: string; name: string }[];
  savingBreakId: string | null;
  onToggleBreak: (playerId: string, onBreak: boolean) => Promise<void>;
  onManagePlayers: () => void;
  onShowHistory: () => void;
  onShowStats: (playerId: string) => void;
  onShowJoinQr: () => void;
};

export default function PlayerQueuePanel({
  isAdmin,
  registeredPlayerCount,
  onCourtPlayers,
  upNextPlayers,
  laterWaitingPlayers,
  onBreakPlayers,
  statsPlayerOptions,
  savingBreakId,
  onToggleBreak,
  onManagePlayers,
  onShowHistory,
  onShowStats,
  onShowJoinQr,
}: PlayerQueuePanelProps) {
  return (
    <section className="rounded-2xl bg-white p-5 shadow ring-1 ring-slate-200">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-widest text-cyan-600">
            Player Queue
          </p>

          <h2 className="text-xl font-black">Registered</h2>

          {isAdmin && (
            <button
              type="button"
              onClick={() => onManagePlayers()}
              className="mt-3 w-full rounded-xl bg-slate-950 px-4 py-3 text-xs font-black uppercase tracking-wider text-white transition hover:bg-slate-800"
            >
              MANAGE PLAYERS
            </button>
          )}

          {isAdmin && statsPlayerOptions.length > 0 && (
            <button
              type="button"
              onClick={() => onShowStats(statsPlayerOptions[0].id)}
              className="mt-3 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-xs font-black uppercase tracking-wider text-slate-700 transition hover:bg-slate-100"
            >
              PLAYER STATS
            </button>
          )}

          {isAdmin && (
            <button
              type="button"
              onClick={onShowJoinQr}
              className="mt-3 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-xs font-black uppercase tracking-wider text-slate-700 transition hover:bg-slate-100"
            >
              ▦ JOIN QR CODE
            </button>
          )}

          {isAdmin && (
            <a
              href="?view=tv"
              target="_blank"
              rel="noreferrer"
              className="mt-3 block w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-center text-xs font-black uppercase tracking-wider text-slate-700 transition hover:bg-slate-100"
            >
              OPEN TV DISPLAY ↗
            </a>
          )}

          {isAdmin && (
            <button
              type="button"
              onClick={() => onShowHistory()}
              className="mt-3 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-xs font-black uppercase tracking-wider text-slate-700 transition hover:bg-slate-100"
            >
              PAST SESSIONS
            </button>
          )}
        </div>

        <span className="rounded-full bg-slate-100 px-3 py-2 font-black">
          {registeredPlayerCount}
        </span>
      </div>

      {/* ===================================== */}
      {/* ON COURT */}
      {/* ===================================== */}

      <div className="mt-5">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-xs font-black uppercase tracking-widest text-emerald-600">
            On Court
          </p>

          <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-black text-emerald-700">
            {onCourtPlayers.length}
          </span>
        </div>

        <div className="space-y-2">
          {onCourtPlayers.map((player) => (
            <div
              key={player.id}
              className="flex items-center justify-between rounded-xl bg-slate-800 px-4 py-3"
            >
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-700 font-black text-white">
                  {player.name.charAt(0).toUpperCase()}
                </div>

                <span className="truncate font-bold text-white">
                  {player.name}
                </span>
              </div>

              <span className="ml-3 shrink-0 rounded-full bg-emerald-500/20 px-2 py-1 text-xs font-black text-emerald-300">
                PLAYING
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ===================================== */}
      {/* UP NEXT */}
      {/* ===================================== */}

      <div className="mt-6 border-t border-slate-200 pt-5">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-xs font-black uppercase tracking-widest text-orange-700">
            Up Next
          </p>

          <span className="rounded-full bg-orange-100 px-2 py-1 text-xs font-black text-orange-700">
            {upNextPlayers.length}
          </span>
        </div>

        {upNextPlayers.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 p-4 text-center text-sm text-slate-500">
            No players waiting.
          </div>
        ) : (
          <div className="space-y-2">
            {upNextPlayers.map((player, index) => (
              <div
                key={player.id}
                className="flex items-center justify-between rounded-xl border border-orange-700 bg-orange-600 px-4 py-3 shadow-sm"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-orange-900 font-black text-white">
                    {player.name.charAt(0).toUpperCase()}
                  </div>

                  <span className="truncate font-bold text-white">
                    {player.name}
                  </span>
                </div>

                <span className="ml-3 shrink-0 rounded-full bg-orange-950/60 px-2 py-1 text-xs font-black text-orange-100">
                  NEXT #{index + 1}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ===================================== */}
      {/* WAITING */}
      {/* ===================================== */}

      {laterWaitingPlayers.length > 0 && (
        <div className="mt-6 border-t border-slate-200 pt-5">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-xs font-black uppercase tracking-widest text-slate-500">
              Waiting
            </p>

            <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-black text-slate-600">
              {laterWaitingPlayers.length}
            </span>
          </div>

          <div className="space-y-2">
            {laterWaitingPlayers.map((player, index) => (
              <div
                key={player.id}
                className="flex items-center justify-between rounded-xl bg-slate-100 px-4 py-3"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-300 font-black text-slate-700">
                    {player.name.charAt(0).toUpperCase()}
                  </div>

                  <span className="truncate font-bold text-slate-700">
                    {player.name}
                  </span>
                </div>

                <span className="ml-3 shrink-0 rounded-full bg-slate-200 px-2 py-1 text-xs font-black text-slate-600">
                  WAIT #{upNextPlayers.length + index + 1}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {onBreakPlayers.length > 0 && (
        <div className="mt-6 border-t border-slate-200 pt-5">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-xs font-black uppercase tracking-widest text-amber-600">
              On Break
            </p>

            <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-black text-amber-700">
              {onBreakPlayers.length}
            </span>
          </div>

          <div className="space-y-2">
            {onBreakPlayers.map((player) => (
              <div
                key={player.id}
                className="flex items-center justify-between rounded-xl bg-amber-50 px-4 py-3"
              >
                <span className="truncate font-bold text-amber-900">
                  ☕ {player.name}
                </span>

                {isAdmin && (
                  <button
                    type="button"
                    disabled={savingBreakId === player.id}
                    onClick={() => void onToggleBreak(player.id, false)}
                    className="ml-3 shrink-0 rounded-lg border border-amber-300 px-3 py-1 text-xs font-black text-amber-700 hover:bg-amber-100 disabled:opacity-50"
                  >
                    BACK IN
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
