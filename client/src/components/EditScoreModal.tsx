import { useState } from "react";

import type { CompletedGame } from "./CompletedGames";

type EditScoreModalProps = {
  game: CompletedGame;
  onSave: (
    scoreA: number,
    scoreB: number
  ) => Promise<void>;
  onClose: () => void;
};

export default function EditScoreModal({
  game,
  onSave,
  onClose,
}: EditScoreModalProps) {
  const [scoreA, setScoreA] = useState(
    String(game.scoreA)
  );
  const [scoreB, setScoreB] = useState(
    String(game.scoreB)
  );
  const [saving, setSaving] = useState(false);

  const teamA = game.players
    .slice(0, 2)
    .map((player) => player.name)
    .join(" & ");
  const teamB = game.players
    .slice(2, 4)
    .map((player) => player.name)
    .join(" & ");

  const a = Number(scoreA);
  const b = Number(scoreB);

  const invalid =
    scoreA.trim() === "" ||
    scoreB.trim() === "" ||
    !Number.isInteger(a) ||
    !Number.isInteger(b) ||
    a < 0 ||
    b < 0 ||
    a === b;

  const unchanged =
    a === game.scoreA && b === game.scoreB;

  const handleSave = async () => {
    setSaving(true);

    try {
      await onSave(a, b);
      onClose();
    } catch (error) {
      console.error(
        "Unable to correct score:",
        error
      );

      alert(
        error instanceof Error
          ? error.message
          : "Unable to correct the score."
      );
    } finally {
      setSaving(false);
    }
  };

  const input = (
    label: string,
    value: string,
    onChange: (value: string) => void
  ) => (
    <label className="block">
      <span className="block truncate text-sm font-black">
        {label}
      </span>
      <input
        type="number"
        min="0"
        inputMode="numeric"
        value={value}
        onChange={(event) =>
          onChange(event.target.value)
        }
        disabled={saving}
        className="mt-1 w-full rounded-xl border border-slate-300 px-4 py-3 text-center text-3xl font-black outline-none focus:border-amber-500"
      />
    </label>
  );

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-950/80 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 text-slate-950 shadow-2xl">
        <p className="text-xs font-black uppercase tracking-widest text-amber-600">
          Admin · Correct Score
        </p>

        <h2 className="mt-1 text-2xl font-black">
          Court {game.courtNumber} · Cycle{" "}
          {game.cycleNumber}
        </h2>

        <p className="mt-2 text-sm text-slate-500">
          Wins, losses and points update to match.
          Who plays next is not changed.
        </p>

        <div className="mt-5 grid grid-cols-2 gap-3">
          {input(teamA, scoreA, setScoreA)}
          {input(teamB, scoreB, setScoreB)}
        </div>

        {a === b && scoreA.trim() !== "" && (
          <p className="mt-3 text-sm font-bold text-red-600">
            A game cannot end in a tie.
          </p>
        )}

        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="flex-1 rounded-xl border border-slate-300 px-4 py-3 font-bold text-slate-700 hover:bg-slate-50"
          >
            CANCEL
          </button>

          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving || invalid || unchanged}
            className="flex-1 rounded-xl bg-amber-500 px-4 py-3 font-black text-slate-950 hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? "SAVING..." : "SAVE SCORE"}
          </button>
        </div>
      </div>
    </div>
  );
}
