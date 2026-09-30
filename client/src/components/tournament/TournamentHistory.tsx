import { useEffect, useState } from "react";

import TournamentLive from "./TournamentLive";
import {
  deleteFromHistory,
  subscribeToTournamentHistory,
  type ArchivedTournament,
} from "../../lib/tournamentStore";
import { teamName } from "../../lib/tournamentView";

type TournamentHistoryProps = {
  isAdmin: boolean;
  onBack: () => void;
};

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// Past tournaments: a list, then one tournament read-only.
export default function TournamentHistory({
  isAdmin,
  onBack,
}: TournamentHistoryProps) {
  const [tournaments, setTournaments] = useState<ArchivedTournament[] | null>(
    null
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => subscribeToTournamentHistory(setTournaments), []);

  const selected = tournaments?.find((t) => t.id === selectedId) ?? null;

  const handleDelete = (t: ArchivedTournament) => {
    if (
      !window.confirm(
        `Delete ${t.name} from history? Its results will be gone for good.`
      )
    ) {
      return;
    }

    void deleteFromHistory(t.id)
      .then(() => setSelectedId(null))
      .catch((error) =>
        alert(error instanceof Error ? error.message : String(error))
      );
  };

  if (selected) {
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setSelectedId(null)}
            className="rounded-xl bg-white px-4 py-2 font-black text-slate-700 shadow ring-1 ring-slate-200 hover:bg-slate-50"
          >
            ← All tournaments
          </button>

          <p className="text-sm font-bold text-slate-500">
            {selected.name} · {formatDate(selected.createdAt)} ·{" "}
            {Object.keys(selected.teams).length} teams
          </p>
        </div>

        <TournamentLive
          tournament={selected}
          userId={null}
          isAdmin={false}
          readOnly
        />

        {isAdmin && (
          <button
            type="button"
            onClick={() => handleDelete(selected)}
            className="w-full rounded-xl px-5 py-3 text-sm font-bold text-red-600 hover:bg-red-50"
          >
            Delete from history
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-2xl font-black">Tournament history</h2>
        <button
          type="button"
          onClick={onBack}
          className="rounded-xl bg-white px-4 py-2 font-black text-slate-700 shadow ring-1 ring-slate-200 hover:bg-slate-50"
        >
          ← Current tournament
        </button>
      </div>

      {tournaments === null ? (
        <p className="text-slate-500">Loading…</p>
      ) : tournaments.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-slate-500">
          No finished tournaments yet. They're saved here
          automatically when the final is played.
        </p>
      ) : (
        <ul className="space-y-3">
          {tournaments.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => setSelectedId(t.id)}
                className="flex w-full items-center gap-4 rounded-2xl bg-white p-5 text-left shadow ring-1 ring-slate-200 hover:ring-cyan-400"
              >
                <span className="text-3xl" aria-hidden>
                  🏆
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-lg font-black">
                    {t.name}
                  </span>
                  <span className="block text-sm text-slate-500">
                    {formatDate(t.createdAt)} ·{" "}
                    {Object.keys(t.teams).length} teams
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block text-[10px] font-black uppercase tracking-widest text-amber-600">
                    Champions
                  </span>
                  <span className="block max-w-[12rem] truncate font-black">
                    {teamName(t, t.championId)}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
