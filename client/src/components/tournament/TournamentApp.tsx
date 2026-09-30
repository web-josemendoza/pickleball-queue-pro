import { useEffect, useState } from "react";

import PlayerAuth from "../PlayerAuth";
import TournamentLive from "./TournamentLive";
import TournamentSetup from "./TournamentSetup";
import { useCurrentProfile } from "../../hooks/useCurrentProfile";
import { logout } from "../../lib/auth";
import {
  DEFAULT_SETTINGS,
  teamsBySeed,
  type Tournament,
} from "../../lib/tournament";
import {
  createTournament,
  subscribeToTournament,
} from "../../lib/tournamentStore";

const STATUS_LABEL: Record<Tournament["status"], string> = {
  setup: "Starting soon",
  pools: "Pool play",
  playoffs: "Playoffs",
  finished: "Finished",
};

function CreateTournament() {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  const create = async () => {
    setSaving(true);

    try {
      await createTournament(name, DEFAULT_SETTINGS);
    } catch (error) {
      alert(error instanceof Error ? error.message : String(error));
      setSaving(false);
    }
  };

  return (
    <section className="rounded-2xl bg-slate-950 p-6 text-white shadow-xl">
      <p className="text-xs font-black uppercase tracking-widest text-cyan-400">
        New tournament
      </p>
      <h2 className="mt-1 text-3xl font-black">Create a tournament</h2>
      <p className="mt-2 text-slate-400">
        Pool play, then a single-elimination playoff. You'll add
        teams and adjust settings next.
      </p>

      <div className="mt-5 flex flex-col gap-3 sm:flex-row">
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Tournament name, e.g. Club Doubles Open"
          className="flex-1 rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 font-bold text-white outline-none focus:border-cyan-400"
        />
        <button
          type="button"
          disabled={saving}
          onClick={() => void create()}
          className="rounded-xl bg-emerald-500 px-6 py-3 font-black text-white hover:bg-emerald-400 disabled:opacity-50"
        >
          CREATE
        </button>
      </div>
    </section>
  );
}

/*
 * Tournament mode (?view=tournament). Everyone can watch;
 * signed-in players can report scores; admins run it.
 */
export default function TournamentApp() {
  const { ready, userId, profile, refresh } = useCurrentProfile();
  const [tournament, setTournament] = useState<Tournament | null | undefined>(
    undefined
  );
  const [showAuth, setShowAuth] = useState(false);

  useEffect(() => subscribeToTournament(setTournament), []);

  const isAdmin = profile?.role === "admin";

  const handleSignOut = async () => {
    if (window.confirm("Sign out of this device?")) {
      await logout();
    }
  };

  let body;

  if (tournament === undefined || !ready) {
    body = <p className="text-slate-500">Loading…</p>;
  } else if (!tournament) {
    body = isAdmin ? (
      <CreateTournament />
    ) : (
      <section className="rounded-2xl bg-white p-8 text-center shadow ring-1 ring-slate-200">
        <h2 className="text-2xl font-black">No tournament right now</h2>
        <p className="mt-2 text-slate-500">Check back when one is announced.</p>
      </section>
    );
  } else if (tournament.status === "setup") {
    body = isAdmin ? (
      <TournamentSetup tournament={tournament} />
    ) : (
      <section className="rounded-2xl bg-white p-6 shadow ring-1 ring-slate-200">
        <h2 className="text-2xl font-black">Starting soon</h2>
        <p className="mt-1 text-slate-500">
          {Object.keys(tournament.teams).length} teams registered.
        </p>
        <ol className="mt-4 space-y-1">
          {teamsBySeed(tournament).map((team) => (
            <li key={team.id} className="font-bold">
              {team.seed}. {team.name}
            </li>
          ))}
        </ol>
      </section>
    );
  } else {
    body = (
      <TournamentLive
        tournament={tournament}
        userId={userId}
        isAdmin={isAdmin}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-950">
      <header className="bg-slate-950 px-4 py-5 text-white shadow-xl sm:px-6">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
          <div>
            <a
              href="/"
              className="text-xs font-black uppercase tracking-[0.25em] text-cyan-400 hover:text-cyan-300"
            >
              ← Open play
            </a>
            <h1 className="text-2xl font-black sm:text-3xl">
              🏆 {tournament?.name ?? "Tournament"}
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {tournament && (
              <span className="rounded-full bg-cyan-500/10 px-4 py-2 text-sm font-bold text-cyan-300">
                {STATUS_LABEL[tournament.status]}
              </span>
            )}

            {tournament && tournament.status !== "setup" && (
              <a
                href="?view=tournament-tv"
                target="_blank"
                rel="noreferrer"
                className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-black hover:bg-slate-800"
              >
                TV ↗
              </a>
            )}

            {profile ? (
              <button
                type="button"
                onClick={() => void handleSignOut()}
                className="rounded-xl bg-slate-900 px-4 py-2 text-left text-sm hover:bg-slate-800"
              >
                <span className="block text-[10px] font-bold uppercase text-slate-500">
                  Signed in
                </span>
                <span className="font-black">{profile.name}</span>
              </button>
            ) : (
              ready && (
                <button
                  type="button"
                  onClick={() => setShowAuth(true)}
                  className="rounded-xl bg-cyan-500 px-4 py-2 font-black text-slate-950 hover:bg-cyan-400"
                >
                  SIGN IN
                </button>
              )
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">{body}</main>

      {showAuth && !profile && (
        <div className="fixed inset-0 z-[125] flex items-center justify-center bg-slate-950/80 p-4">
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-4">
            <PlayerAuth
              onAuthenticated={async (id) => {
                await refresh(id);
                setShowAuth(false);
              }}
            />
            <button
              type="button"
              onClick={() => setShowAuth(false)}
              className="mt-3 w-full rounded-xl border border-slate-300 px-4 py-3 font-bold text-slate-700"
            >
              CANCEL
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
