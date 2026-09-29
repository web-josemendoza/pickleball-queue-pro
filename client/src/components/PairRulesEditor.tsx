import { useState } from "react";

import type {
  FixedPair,
  PairKind,
} from "../lib/game";
import type { QueuePlayer } from "../lib/queue";

type PairRulesEditorProps = {
  kind: PairKind;
  players: QueuePlayer[];
  pairs: FixedPair[];
  description: string;
  onAdd: (
    playerAId: string,
    playerBId: string
  ) => Promise<void>;
  onRemove: (
    pair: FixedPair
  ) => Promise<void>;
};

const COPY: Record<
  PairKind,
  {
    title: string;
    joiner: string;
    addLabel: string;
    removeLabel: string;
  }
> = {
  fixed: {
    title: "Fixed Pairs",
    joiner: "&",
    addLabel: "PAIR",
    removeLabel: "UNPAIR",
  },
  keepApart: {
    title: "Keep Apart",
    joiner: "≠",
    addLabel: "KEEP APART",
    removeLabel: "REMOVE",
  },
};

// Full class names so Tailwind can see them.
const TONE: Record<
  PairKind,
  {
    box: string;
    heading: string;
    text: string;
    input: string;
    button: string;
    row: string;
    joiner: string;
    remove: string;
  }
> = {
  fixed: {
    box: "border-violet-200 bg-violet-50",
    heading: "text-violet-700",
    text: "text-violet-900/70",
    input: "border-violet-200 focus:border-violet-500",
    button: "bg-violet-600 hover:bg-violet-500",
    row: "ring-violet-200",
    joiner: "text-violet-500",
    remove: "border-violet-200 text-violet-600 hover:bg-violet-100",
  },
  keepApart: {
    box: "border-rose-200 bg-rose-50",
    heading: "text-rose-700",
    text: "text-rose-900/70",
    input: "border-rose-200 focus:border-rose-500",
    button: "bg-rose-600 hover:bg-rose-500",
    row: "ring-rose-200",
    joiner: "text-rose-500",
    remove: "border-rose-200 text-rose-600 hover:bg-rose-100",
  },
};

export default function PairRulesEditor({
  kind,
  players,
  pairs,
  description,
  onAdd,
  onRemove,
}: PairRulesEditorProps) {
  const [playerAId, setPlayerAId] =
    useState("");

  const [playerBId, setPlayerBId] =
    useState("");

  const [saving, setSaving] =
    useState(false);

  const copy = COPY[kind];
  const tone = TONE[kind];

  // A player can be in only one fixed pair, but
  // can be kept apart from several people.
  const pairedIds = new Set(
    kind === "fixed"
      ? pairs.flatMap((pair) => [
          pair.playerA,
          pair.playerB,
        ])
      : []
  );

  const selectablePlayers =
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
        `${copy.title} update failed:`,
        error
      );

      alert(
        error instanceof Error
          ? error.message
          : `Unable to update ${copy.title.toLowerCase()}.`
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
      className={`rounded-xl border bg-white px-4 py-3 font-bold text-slate-950 outline-none ${tone.input}`}
    >
      <option value="">
        {placeholder}
      </option>

      {selectablePlayers
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
    <div className={`rounded-2xl border p-5 text-slate-950 ${tone.box}`}>
      <p className={`text-xs font-black uppercase tracking-widest ${tone.heading}`}>
        {copy.title}
      </p>

      <p className={`mt-1 text-sm ${tone.text}`}>
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
          className={`rounded-xl px-5 py-3 font-black text-white disabled:cursor-not-allowed disabled:opacity-50 ${tone.button}`}
        >
          {saving ? "SAVING..." : copy.addLabel}
        </button>
      </div>

      {pairs.length > 0 && (
        <div className="mt-4 space-y-2">
          {pairs.map((pair) => (
            <div
              key={`${pair.playerA}-${pair.playerB}`}
              className={`flex items-center justify-between gap-3 rounded-xl bg-white px-4 py-3 ring-1 ${tone.row}`}
            >
              <p className="min-w-0 truncate font-black">
                {nameOf(pair.playerA)}
                <span className={`px-2 ${tone.joiner}`}>
                  {copy.joiner}
                </span>
                {nameOf(pair.playerB)}
              </p>

              <button
                type="button"
                disabled={saving}
                onClick={() =>
                  void run(() =>
                    onRemove(pair)
                  )
                }
                className={`shrink-0 rounded-lg border px-4 py-2 text-xs font-black disabled:opacity-50 ${tone.remove}`}
              >
                {copy.removeLabel}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
