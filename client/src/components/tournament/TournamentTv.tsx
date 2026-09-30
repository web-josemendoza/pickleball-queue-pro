import { useEffect, useState } from "react";

import Bracket from "./Bracket";
import PoolStandings from "./PoolStandings";
import JoinQrCode from "../JoinQrCode";
import {
  matchList,
  upNextMatches,
  type Tournament,
} from "../../lib/tournament";
import { subscribeToTournament } from "../../lib/tournamentStore";
import { matchLabel, teamName } from "../../lib/tournamentView";

/*
 * Read-only big-screen tournament view for the venue
 * (?view=tournament-tv).
 */
export default function TournamentTv() {
  const [tournament, setTournament] = useState<Tournament | null>(null);

  useEffect(() => subscribeToTournament(setTournament), []);

  if (!tournament || tournament.status === "setup") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 p-8 text-center text-white">
        <p className="text-lg font-black uppercase tracking-[0.3em] text-amber-400">
          🏆 Tournament
        </p>
        <h1 className="mt-4 text-5xl font-black sm:text-7xl">
          {tournament?.name ?? "Coming soon"}
        </h1>
        {tournament && (
          <p className="mt-6 text-2xl font-bold text-slate-400">
            {Object.keys(tournament.teams).length} teams · starting soon
          </p>
        )}
      </div>
    );
  }

  const playing = matchList(tournament)
    .filter((m) => m.status === "playing")
    .sort((a, b) => (a.court ?? 0) - (b.court ?? 0));

  const upNext = upNextMatches(tournament, 6);
  const inPlayoffs = tournament.status !== "pools";

  return (
    <div className="min-h-screen bg-slate-950 p-6 text-white lg:p-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-black uppercase tracking-[0.3em] text-amber-400">
            🏆 Tournament
          </p>
          <h1 className="text-4xl font-black lg:text-5xl">{tournament.name}</h1>
        </div>

        <div className="flex items-center gap-4">
          <JoinQrCode size={96} />
          <p className="max-w-[10rem] text-lg font-black">
            Scan for scores & your next match
          </p>
        </div>
      </header>

      {tournament.status === "finished" && (
        <div className="mt-8 rounded-3xl bg-amber-400 p-8 text-center text-slate-950">
          <p className="text-lg font-black uppercase tracking-[0.3em]">Champions</p>
          <p className="mt-2 text-6xl font-black">
            🏆 {teamName(tournament, tournament.championId)}
          </p>
        </div>
      )}

      {playing.length > 0 && (
        <section className="mt-8 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {playing.map((m) => (
            <div key={m.id} className="rounded-3xl bg-slate-900 p-6 ring-4 ring-slate-800">
              <div className="flex items-center justify-between">
                <h2 className="text-3xl font-black">Court {m.court}</h2>
                <span className="text-lg font-bold text-cyan-300">
                  {matchLabel(tournament, m)}
                </span>
              </div>
              <p className="mt-4 truncate rounded-2xl bg-slate-800 px-5 py-3 text-3xl font-black">
                {teamName(tournament, m.teamA)}
              </p>
              <p className="py-1 text-center text-lg font-black text-slate-500">VS</p>
              <p className="truncate rounded-2xl bg-slate-800 px-5 py-3 text-3xl font-black">
                {teamName(tournament, m.teamB)}
              </p>
            </div>
          ))}
        </section>
      )}

      {upNext.length > 0 && (
        <section className="mt-8 rounded-3xl bg-orange-500 p-6 text-slate-950">
          <p className="text-sm font-black uppercase tracking-widest">Up next</p>
          <ol className="mt-3 grid gap-x-8 gap-y-1 md:grid-cols-2">
            {upNext.map((m, index) => (
              <li key={m.id} className="truncate text-2xl font-black">
                {index + 1}. {teamName(tournament, m.teamA)} vs{" "}
                {teamName(tournament, m.teamB)}
              </li>
            ))}
          </ol>
        </section>
      )}

      <section className="mt-8 text-slate-950">
        {inPlayoffs ? (
          <div className="rounded-3xl bg-slate-100 p-6">
            <Bracket tournament={tournament} highlightTeamId={null} />
          </div>
        ) : (
          <PoolStandings tournament={tournament} highlightTeamId={null} />
        )}
      </section>
    </div>
  );
}
