import { useState } from "react";

import type { FixedPair } from "../lib/game";
import type { QueuePlayer } from "../lib/queue";

type FixedPairsEditorProps = {
  players: QueuePlayer[];
  pairs: FixedPair[];
  description: string;
  onAdd: (
    playerAId: string,
    playerBId: string
  ) => Promise<void>;
  onRemove: (
    playerId: string
  ) => Promise<void>;
};

export default function FixedPairsEditor({
  players,
  pairs,
  description,
  onAdd,
  onRemove,
}: FixedPairsEditorProps) {
  const [playerAId, setPlayerAId] =
    useState("");

  const [playerBId, setPlayerBId] =
    useState("");

  const [saving, setSaving] =
    useState(false);

  const pairedIds = new Set(
    pairs.flatMap((pair) => [
      pair.playerA,
      pair.playerB,
    ])
  );

  const unpairedPlayers =
    players.filter(
      (player) =>
        !pairedIds.has(player.id)
    );

  const nameOf = (id: string) =>
    players.find(
      (player) => player.id === id
    )?.name ?? "Left the queue";

  const run = async (
    action: () => Promise<void>
  ) => {
    setSaving(true);

    try {
      await action();
    } catch (error) {
      console.error(
        "Fixed pair update failed:",
        error
      );

      alert(
        error instanceof Error
          ? error.message
          : "Unable to update fixed pairs."
      );
    } finally {
      setSaving(false);
    }
  };

  const handleAdd = () =>
    run(async () => {
      await onAdd(playerAId, playerBId);
      setPlayerAId("");
      setPlayerBId("");
    });

  const renderSelect = (
    value: string,
    onChange: (id: string) => void,
    excludeId: string,
    placeholder: string
  ) => (
    <select
      value={value}
      onChange={(event) =>
        onChange(event.target.value)
      }
      disabled={saving}
      className="rounded-xl border border-violet-200 bg-white px-4 py-3 font-bold text-slate-950 outline-none focus:border-violet-500"
    >
      <option value="">
        {placeholder}
      </option>

      {unpairedPlayers
        .filter(
          (player) =>
            player.id !== excludeId
        )
        .map((player) => (
          <option
            key={player.id}
            value={player.id}
          >
            {player.name}
          </option>
        ))}
    </select>
  );

  return (
    <div className="rounded-2xl border border-violet-200 bg-violet-50 p-5 text-slate-950">
      <p className="text-xs font-black uppercase tracking-widest text-violet-700">
        Fixed Pairs
      </p>

      <p className="mt-1 text-sm text-violet-900/70">
        {description}
      </p>

      <div className="mt-4 grid gap-3 md:grid-cols-[1fr_1fr_auto]">
        {renderSelect(
          playerAId,
          setPlayerAId,
          playerBId,
          "First player"
        )}

        {renderSelect(
          playerBId,
          setPlayerBId,
          playerAId,
          "Second player"
        )}

        <button
          type="button"
          disabled={
            saving ||
            !playerAId ||
            !playerBId
          }
          onClick={() =>
            void handleAdd()
          }
          className="rounded-xl bg-violet-600 px-5 py-3 font-black text-white hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? "SAVING..." : "PAIR"}
        </button>
      </div>

      {pairs.length > 0 && (
        <div className="mt-4 space-y-2">
          {pairs.map((pair) => (
            <div
              key={`${pair.playerA}-${pair.playerB}`}
              className="flex items-center justify-between gap-3 rounded-xl bg-white px-4 py-3 ring-1 ring-violet-200"
            >
              <p className="min-w-0 truncate font-black">
                {nameOf(pair.playerA)}
                <span className="px-2 text-violet-500">
                  &
                </span>
                {nameOf(pair.playerB)}
              </p>

              <button
                type="button"
                disabled={saving}
                onClick={() =>
                  void run(() =>
                    onRemove(pair.playerA)
                  )
                }
                className="shrink-0 rounded-lg border border-violet-200 px-4 py-2 text-xs font-black text-violet-600 hover:bg-violet-100 disabled:opacity-50"
              >
                UNPAIR
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
