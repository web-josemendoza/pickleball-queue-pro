import { useState } from "react";

import type { Tournament, TournamentMatch } from "../../lib/tournament";
import { reportMatchResult } from "../../lib/tournamentStore";
import { matchLabel, teamName } from "../../lib/tournamentView";

type TournamentMatchCardProps = {
  tournament: Tournament;
  match: TournamentMatch;
  canReport: boolean;
  highlightTeamId: string | null;
};

// A match on court: teams, target score and score entry.
export default function TournamentMatchCard({
  tournament,
  match,
  canReport,
  highlightTeamId,
}: TournamentMatchCardProps) {
  const [scoreA, setScoreA] = useState("");
  const [scoreB, setScoreB] = useState("");
  const [saving, setSaving] = useState(false);

  const target =
    match.stage === "pool"
      ? tournament.settings.poolPoints
      : tournament.settings.playoffPoints;

  const mine =
    highlightTeamId !== null &&
    (match.teamA === highlightTeamId || match.teamB === highlightTeamId);

  const handleFinish = async () => {
    const a = Number(scoreA);
    const b = Number(scoreB);

    if (scoreA.trim() === "" || scoreB.trim() === "") {
      alert("Enter both scores.");
      return;
    }

    if (
      !window.confirm(
        `Final score ${teamName(tournament, match.teamA)} ${a} – ${b} ${teamName(tournament, match.teamB)}?`
      )
    ) {
      return;
    }

    setSaving(true);

    try {
      await reportMatchResult(match.id, a, b);
    } catch (error) {
      alert(error instanceof Error ? error.message : String(error));
      setSaving(false);
    }
  };

  const side = (
    teamId: string | null,
    value: string,
    onChange: (v: string) => void
  ) => (
    <div className="flex items-center gap-3 rounded-xl bg-slate-800 px-4 py-3">
      <span className="min-w-0 flex-1 truncate text-lg font-black">
        {teamName(tournament, teamId)}
      </span>
      {canReport && (
        <input
          type="number"
          min="0"
          inputMode="numeric"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="0"
          aria-label={`${teamName(tournament, teamId)} score`}
          className="w-20 rounded-lg border border-slate-600 bg-slate-950 px-2 py-2 text-center text-2xl font-black outline-none focus:border-cyan-400"
        />
      )}
    </div>
  );

  return (
    <section
      className={`rounded-2xl bg-slate-900 p-5 text-white shadow-xl ring-2 ${
        mine ? "ring-emerald-400" : "ring-slate-800"
      }`}
    >
      <div className="flex items-center justify-between">
        <p className="text-xs font-black uppercase tracking-widest text-cyan-400">
          Court {match.court}
        </p>
        <p className="text-xs font-bold text-slate-400">
          {matchLabel(tournament, match)} · to {target}
        </p>
      </div>

      <div className="mt-3 space-y-2">
        {side(match.teamA, scoreA, setScoreA)}
        <p className="text-center text-xs font-black text-slate-500">VS</p>
        {side(match.teamB, scoreB, setScoreB)}
      </div>

      {canReport ? (
        <button
          type="button"
          disabled={saving}
          onClick={() => void handleFinish()}
          className="mt-4 w-full rounded-xl bg-emerald-500 px-5 py-3 font-black text-white hover:bg-emerald-400 disabled:opacity-50"
        >
          {saving ? "SAVING..." : "FINISH MATCH"}
        </button>
      ) : (
        <p className="mt-4 text-center text-xs font-bold text-slate-500">
          Sign in to enter the score.
        </p>
      )}
    </section>
  );
}
