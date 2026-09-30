import { useState } from "react";

import Bracket from "./Bracket";
import PoolStandings from "./PoolStandings";
import TournamentMatchCard from "./TournamentMatchCard";
import {
  matchList,
  upNextMatches,
  type Tournament,
  type TournamentMatch,
} from "../../lib/tournament";
import {
  correctMatchResult,
  deleteTournament,
  finishAndClear,
} from "../../lib/tournamentStore";
import {
  matchLabel,
  nextMatchFor,
  teamName,
  teamOfPlayer,
} from "../../lib/tournamentView";

type TournamentLiveProps = {
  tournament: Tournament;
  userId: string | null;
  isAdmin: boolean;
  // Past tournaments: no score entry, edits or delete.
  readOnly?: boolean;
};

function MyMatch({
  tournament,
  teamId,
}: {
  tournament: Tournament;
  teamId: string;
}) {
  const info = nextMatchFor(tournament, teamId);
  const opponent = (m: TournamentMatch) =>
    teamName(tournament, m.teamA === teamId ? m.teamB : m.teamA);

  const text =
    info.kind === "champion"
      ? "🏆 You won the tournament!"
      : info.kind === "playing"
        ? `You're on Court ${info.match.court} vs ${opponent(info.match)}.`
        : info.kind === "upNext"
          ? `You're up next (#${info.position}) vs ${opponent(info.match)}.`
          : info.kind === "waiting"
            ? `Next: ${matchLabel(tournament, info.match)} vs ${opponent(info.match)}.`
            : info.kind === "eliminated"
              ? "Your tournament is over. Thanks for playing!"
              : "Waiting for your next match.";

  return (
    <section className="rounded-2xl bg-emerald-500 p-5 text-white shadow-xl">
      <p className="text-xs font-black uppercase tracking-widest text-emerald-100">
        Your team · {teamName(tournament, teamId)}
      </p>
      <p className="mt-1 text-xl font-black">{text}</p>
    </section>
  );
}

function CorrectScoreModal({
  tournament,
  match,
  onClose,
}: {
  tournament: Tournament;
  match: TournamentMatch;
  onClose: () => void;
}) {
  const [a, setA] = useState(String(match.scoreA ?? ""));
  const [b, setB] = useState(String(match.scoreB ?? ""));
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);

    try {
      await correctMatchResult(match.id, Number(a), Number(b));
      onClose();
    } catch (error) {
      alert(error instanceof Error ? error.message : String(error));
      setSaving(false);
    }
  };

  const field = (label: string, value: string, set: (v: string) => void) => (
    <label className="block">
      <span className="block truncate text-sm font-black">{label}</span>
      <input
        type="number"
        min="0"
        value={value}
        onChange={(event) => set(event.target.value)}
        className="mt-1 w-full rounded-xl border border-slate-300 px-4 py-3 text-center text-3xl font-black outline-none focus:border-amber-500"
      />
    </label>
  );

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-950/80 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 text-slate-950 shadow-2xl">
        <p className="text-xs font-black uppercase tracking-widest text-amber-600">
          Admin · Correct score
        </p>
        <h2 className="mt-1 text-2xl font-black">
          {matchLabel(tournament, match)}
        </h2>

        <div className="mt-5 grid grid-cols-2 gap-3">
          {field(teamName(tournament, match.teamA), a, setA)}
          {field(teamName(tournament, match.teamB), b, setB)}
        </div>

        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl border border-slate-300 px-4 py-3 font-bold text-slate-700"
          >
            CANCEL
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void save()}
            className="flex-1 rounded-xl bg-amber-500 px-4 py-3 font-black text-slate-950 disabled:opacity-50"
          >
            {saving ? "SAVING..." : "SAVE SCORE"}
          </button>
        </div>
      </div>
    </div>
  );
}

// Everything while a tournament is running or finished.
export default function TournamentLive({
  tournament,
  userId,
  isAdmin: isAdminUser,
  readOnly = false,
}: TournamentLiveProps) {
  const isAdmin = isAdminUser && !readOnly;
  const [editing, setEditing] = useState<TournamentMatch | null>(null);

  const myTeam = readOnly ? null : teamOfPlayer(tournament, userId);
  const all = matchList(tournament);

  const playing = all
    .filter((m) => m.status === "playing")
    .sort((a, b) => (a.court ?? 0) - (b.court ?? 0));

  const upNext = upNextMatches(tournament, tournament.settings.courtCount);

  const done = all
    .filter((m) => m.status === "done" && !m.bye)
    .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0));

  const hasPlayoff = all.some((m) => m.stage === "playoff");

  const handleStartNew = () => {
    if (
      window.confirm(
        `Save ${tournament.name} to history and clear it so you can create a new tournament?`
      )
    ) {
      void finishAndClear(tournament).catch((error) =>
        alert(error instanceof Error ? error.message : String(error))
      );
    }
  };

  const handleDelete = () => {
    if (
      window.confirm(
        `Delete ${tournament.name} and all its results? This can't be undone.`
      )
    ) {
      void deleteTournament().catch((error) =>
        alert(error instanceof Error ? error.message : String(error))
      );
    }
  };

  return (
    <div className="space-y-8">
      {tournament.status === "finished" && (
        <section className="rounded-2xl bg-amber-400 p-6 text-center text-slate-950 shadow-xl">
          <p className="text-xs font-black uppercase tracking-[0.3em]">Champions</p>
          <p className="mt-2 text-4xl font-black">
            🏆 {teamName(tournament, tournament.championId)}
          </p>
        </section>
      )}

      {myTeam && tournament.status !== "finished" && (
        <MyMatch tournament={tournament} teamId={myTeam} />
      )}

      {playing.length > 0 && (
        <section>
          <h2 className="mb-3 text-xl font-black">On court</h2>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {playing.map((m) => (
              <TournamentMatchCard
                key={m.id}
                tournament={tournament}
                match={m}
                canReport={userId !== null && !readOnly}
                highlightTeamId={myTeam}
              />
            ))}
          </div>
        </section>
      )}

      {upNext.length > 0 && (
        <section>
          <h2 className="mb-3 text-xl font-black">Up next</h2>
          <ol className="space-y-2">
            {upNext.map((m, index) => (
              <li
                key={m.id}
                className={`flex items-center gap-3 rounded-xl bg-white px-4 py-3 shadow ring-1 ${
                  myTeam && (m.teamA === myTeam || m.teamB === myTeam)
                    ? "ring-emerald-400"
                    : "ring-slate-200"
                }`}
              >
                <span className="font-black text-orange-500">#{index + 1}</span>
                <span className="min-w-0 flex-1 truncate font-bold">
                  {teamName(tournament, m.teamA)} vs {teamName(tournament, m.teamB)}
                </span>
                <span className="shrink-0 text-xs font-bold text-slate-400">
                  {matchLabel(tournament, m)}
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {hasPlayoff && (
        <section>
          <h2 className="mb-3 text-xl font-black">Playoff</h2>
          <Bracket tournament={tournament} highlightTeamId={myTeam} />
        </section>
      )}

      <section>
        <h2 className="mb-3 text-xl font-black">Pools</h2>
        <PoolStandings tournament={tournament} highlightTeamId={myTeam} />
      </section>

      {done.length > 0 && (
        <section>
          <h2 className="mb-3 text-xl font-black">Results</h2>
          <ul className="space-y-2">
            {done.map((m) => (
              <li
                key={m.id}
                className="flex items-center gap-3 rounded-xl bg-white px-4 py-3 shadow ring-1 ring-slate-200"
              >
                <span className="min-w-0 flex-1 truncate text-sm">
                  <span className={m.winner === m.teamA ? "font-black" : ""}>
                    {teamName(tournament, m.teamA)}
                  </span>{" "}
                  <span className="font-black tabular-nums">
                    {m.scoreA}–{m.scoreB}
                  </span>{" "}
                  <span className={m.winner === m.teamB ? "font-black" : ""}>
                    {teamName(tournament, m.teamB)}
                  </span>
                </span>
                <span className="shrink-0 text-xs font-bold text-slate-400">
                  {matchLabel(tournament, m)}
                </span>
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => setEditing(m)}
                    className="shrink-0 rounded-lg border border-amber-300 px-2 py-1 text-xs font-black text-amber-700 hover:bg-amber-50"
                  >
                    EDIT
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {isAdmin && tournament.status === "finished" && (
        <button
          type="button"
          onClick={handleStartNew}
          className="w-full rounded-xl bg-emerald-500 px-5 py-4 text-lg font-black text-white hover:bg-emerald-400"
        >
          START A NEW TOURNAMENT
        </button>
      )}

      {isAdmin && tournament.status !== "finished" && (
        <button
          type="button"
          onClick={handleDelete}
          className="w-full rounded-xl px-5 py-3 text-sm font-bold text-red-600 hover:bg-red-50"
        >
          Delete tournament
        </button>
      )}

      {editing && (
        <CorrectScoreModal
          tournament={tournament}
          match={editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
