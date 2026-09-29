import { useMemo, useState } from "react";

import type { OpenPlayState } from "../lib/game";
import { getPlayerHistory } from "../lib/playerHistory";

type PlayerOption = {
  id: string;
  name: string;
};

type PlayerStatsModalProps = {
  sessions: OpenPlayState[];
  initialPlayerId: string;
  // Admins can look up anyone; players see themselves.
  playerOptions?: PlayerOption[];
  onClose: () => void;
};

export default function PlayerStatsModal({
  sessions,
  initialPlayerId,
  playerOptions,
  onClose,
}: PlayerStatsModalProps) {
  const [playerId, setPlayerId] =
    useState(initialPlayerId);

  const history = useMemo(
    () => getPlayerHistory(playerId, sessions),
    [playerId, sessions]
  );

  const displayName =
    history.name ||
    playerOptions?.find(
      (option) => option.id === playerId
    )?.name ||
    "Player";

  const pointDiff =
    history.pointsFor - history.pointsAgainst;

  const tiles = [
    { label: "Sessions", value: history.sessions },
    { label: "Games", value: history.games },
    {
      label: "Record",
      value: `${history.wins}–${history.losses}`,
    },
    {
      label: "Win Rate",
      value: `${Math.round(history.winRate * 100)}%`,
    },
    {
      label: "Point Diff",
      value:
        pointDiff > 0 ? `+${pointDiff}` : pointDiff,
    },
  ];

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/80 p-4">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white text-slate-950 shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 p-6">
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-widest text-cyan-600">
              Player Stats
            </p>

            <h2 className="mt-1 truncate text-2xl font-black">
              {displayName}
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              All saved sessions, including the one in progress.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-slate-100 px-3 py-2 font-black text-slate-500 hover:bg-slate-200"
          >
            ✕
          </button>
        </div>

        <div className="overflow-y-auto p-6">
          {playerOptions && playerOptions.length > 0 && (
            <select
              value={playerId}
              onChange={(event) =>
                setPlayerId(event.target.value)
              }
              className="mb-5 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 font-bold outline-none focus:border-cyan-500"
            >
              {playerOptions.map((option) => (
                <option
                  key={option.id}
                  value={option.id}
                >
                  {option.name}
                </option>
              ))}
            </select>
          )}

          {history.games === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
              No completed games yet.
            </p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                {tiles.map((tile) => (
                  <div
                    key={tile.label}
                    className="rounded-xl bg-slate-100 p-3 text-center"
                  >
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                      {tile.label}
                    </p>
                    <p className="mt-1 text-xl font-black tabular-nums">
                      {tile.value}
                    </p>
                  </div>
                ))}
              </div>

              {history.topPartners.length > 0 && (
                <div className="mt-6">
                  <p className="text-xs font-black uppercase tracking-widest text-slate-500">
                    Most Frequent Partners
                  </p>

                  <div className="mt-2 space-y-2">
                    {history.topPartners.map((partner) => (
                      <div
                        key={partner.playerId}
                        className="flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3"
                      >
                        <span className="truncate font-black">
                          {partner.name}
                        </span>
                        <span className="ml-3 shrink-0 text-sm font-bold text-slate-500">
                          {partner.games} game
                          {partner.games === 1 ? "" : "s"} ·{" "}
                          {partner.wins}W
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-6">
                <p className="text-xs font-black uppercase tracking-widest text-slate-500">
                  Recent Games
                </p>

                <div className="mt-2 space-y-2">
                  {history.recentGames.map((game, index) => (
                    <div
                      key={`${game.sessionId}-${game.completedAt}-${index}`}
                      className="flex items-center gap-3 rounded-xl border border-slate-200 px-4 py-3"
                    >
                      <span
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-black ${
                          game.won
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-red-100 text-red-700"
                        }`}
                      >
                        {game.won ? "W" : "L"}
                      </span>

                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-black">
                          with {game.partnerName || "—"}
                        </p>
                        <p className="truncate text-xs text-slate-500">
                          vs {game.opponentNames.join(" & ")} ·{" "}
                          {new Date(
                            game.completedAt
                          ).toLocaleDateString()}
                        </p>
                      </div>

                      <span className="shrink-0 font-black tabular-nums">
                        {game.myScore}–{game.theirScore}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
