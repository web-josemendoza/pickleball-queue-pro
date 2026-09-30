import {
  matchList,
  type Tournament,
  type TournamentMatch,
} from "../../lib/tournament";
import {
  playoffRounds,
  roundName,
  teamName,
} from "../../lib/tournamentView";

type BracketProps = {
  tournament: Tournament;
  highlightTeamId: string | null;
};

// Playoff rounds side by side; scrolls sideways on phones.
export default function Bracket({ tournament, highlightTeamId }: BracketProps) {
  const rounds = playoffRounds(tournament);
  const playoff = matchList(tournament).filter((m) => m.stage === "playoff");

  if (rounds === 0) {
    return null;
  }

  const row = (m: TournamentMatch, teamId: string | null, score: number | null) => {
    const won = m.status === "done" && m.winner === teamId && teamId !== null;

    return (
      <div
        className={`flex items-center justify-between gap-2 px-3 py-2 ${
          teamId === highlightTeamId && teamId ? "bg-emerald-50" : ""
        }`}
      >
        <span
          className={`truncate text-sm ${
            won ? "font-black text-slate-950" : "font-semibold text-slate-600"
          } ${!teamId ? "italic text-slate-400" : ""}`}
        >
          {teamId ? teamName(tournament, teamId) : m.bye ? "Bye" : "TBD"}
        </span>
        <span className="shrink-0 text-sm font-black tabular-nums">
          {m.status === "done" && !m.bye ? score : ""}
        </span>
      </div>
    );
  };

  return (
    <div className="overflow-x-auto pb-2">
      <div className="flex min-w-max gap-4">
        {Array.from({ length: rounds }, (_, i) => i + 1).map((round) => (
          <div key={round} className="flex w-56 flex-col">
            <p className="mb-2 text-xs font-black uppercase tracking-widest text-slate-500">
              {roundName(round, rounds)}
            </p>

            <div className="flex flex-1 flex-col justify-around gap-3">
              {playoff
                .filter((m) => m.round === round)
                .sort((a, b) => (a.slot ?? 0) - (b.slot ?? 0))
                .map((m) => (
                  <div
                    key={m.id}
                    className={`divide-y divide-slate-100 overflow-hidden rounded-xl bg-white shadow ring-1 ${
                      m.status === "playing" ? "ring-2 ring-cyan-400" : "ring-slate-200"
                    }`}
                  >
                    {row(m, m.teamA, m.scoreA)}
                    {row(m, m.teamB, m.scoreB)}
                    {m.status === "playing" && (
                      <p className="bg-cyan-50 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-cyan-700">
                        Now on court {m.court}
                      </p>
                    )}
                  </div>
                ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
