import { useEffect, useMemo, useState } from "react";

import {
  getAllPlayerProfiles,
  type PlayerProfile,
} from "../../lib/player";
import {
  makePools,
  teamsBySeed,
  type Tournament,
  type TournamentSettings,
} from "../../lib/tournament";
import {
  addTeam,
  beginTournament,
  deleteTournament,
  removeTeam,
  setSeedOrder,
  updateSettings,
} from "../../lib/tournamentStore";
import { formatPreview, poolName } from "../../lib/tournamentView";

type TournamentSetupProps = {
  tournament: Tournament;
};

const SETTING_FIELDS: {
  key: keyof TournamentSettings;
  label: string;
  min: number;
  max: number;
}[] = [
  { key: "courtCount", label: "Courts", min: 1, max: 20 },
  { key: "poolSize", label: "Teams per pool", min: 3, max: 8 },
  { key: "advancePerPool", label: "Advance per pool", min: 1, max: 4 },
  { key: "poolPoints", label: "Pool games to", min: 5, max: 21 },
  { key: "playoffPoints", label: "Playoff games to", min: 5, max: 21 },
];

function skillValue(profile: PlayerProfile | undefined): number {
  if (!profile) return 3.0;
  return profile.skillLevel === "5.0+" ? 5.5 : profile.skillLevel;
}

async function run(action: () => Promise<void>) {
  try {
    await action();
  } catch (error) {
    alert(error instanceof Error ? error.message : String(error));
  }
}

/*
 * Admin setup: settings, teams and seeding, then Start.
 */
export default function TournamentSetup({ tournament }: TournamentSetupProps) {
  const [profiles, setProfiles] = useState<PlayerProfile[]>([]);
  const [playerA, setPlayerA] = useState("");
  const [playerB, setPlayerB] = useState("");
  const [teamName, setTeamName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void getAllPlayerProfiles()
      .then((all) => setProfiles(all.sort((a, b) => a.name.localeCompare(b.name))))
      .catch((error) => console.error("Unable to load players:", error));
  }, []);

  const teams = teamsBySeed(tournament);
  const { settings } = tournament;

  const profileByName = useMemo(
    () =>
      new Map(profiles.map((p) => [p.name.trim().toLowerCase(), p])),
    [profiles]
  );

  const pools = makePools(
    teams.map((team) => team.id),
    settings.poolSize
  );

  const preview = formatPreview(
    teams.length,
    pools.length,
    settings.advancePerPool
  );

  // Typed names that match an account are linked to it.
  const toMember = (typed: string) => {
    const name = typed.trim();
    const profile = profileByName.get(name.toLowerCase());
    return profile
      ? { name: profile.name, playerId: profile.playerId }
      : { name };
  };

  const handleAddTeam = async () => {
    setBusy(true);
    await run(async () => {
      await addTeam([toMember(playerA), toMember(playerB)], teamName);
      setPlayerA("");
      setPlayerB("");
      setTeamName("");
    });
    setBusy(false);
  };

  const move = (index: number, direction: -1 | 1) => {
    const ids = teams.map((team) => team.id);
    const target = index + direction;

    if (target < 0 || target >= ids.length) return;

    [ids[index], ids[target]] = [ids[target], ids[index]];
    void run(() => setSeedOrder(ids));
  };

  const seedBySkill = () => {
    const byId = new Map(profiles.map((p) => [p.playerId, p]));
    const strength = (teamId: string) =>
      tournament.teams[teamId].members.reduce(
        (sum, m) => sum + skillValue(m.playerId ? byId.get(m.playerId) : undefined),
        0
      );

    const ids = teams
      .map((team) => team.id)
      .sort((a, b) => strength(b) - strength(a));

    void run(() => setSeedOrder(ids));
  };

  const changeSetting = (key: keyof TournamentSettings, raw: string) => {
    const field = SETTING_FIELDS.find((f) => f.key === key)!;
    const value = Math.min(field.max, Math.max(field.min, Number(raw) || field.min));
    void run(() => updateSettings({ ...settings, [key]: value }));
  };

  const handleStart = async () => {
    if (!window.confirm(`Start ${tournament.name}? Teams and settings will be locked.`)) {
      return;
    }

    setBusy(true);
    await run(beginTournament);
    setBusy(false);
  };

  const handleDelete = () => {
    if (window.confirm(`Delete ${tournament.name}? This can't be undone.`)) {
      void run(deleteTournament);
    }
  };

  const nameInput = (
    value: string,
    onChange: (value: string) => void,
    placeholder: string
  ) => (
    <input
      value={value}
      onChange={(event) => onChange(event.target.value)}
      list="tournament-player-names"
      placeholder={placeholder}
      disabled={busy}
      className="rounded-xl border border-slate-300 bg-white px-4 py-3 font-bold text-slate-950 outline-none focus:border-cyan-500"
    />
  );

  const linked = (typed: string) =>
    typed.trim() !== "" && profileByName.has(typed.trim().toLowerCase());

  return (
    <div className="space-y-6">
      {/* SETTINGS */}
      <section className="rounded-2xl bg-slate-950 p-6 text-white shadow-xl">
        <p className="text-xs font-black uppercase tracking-widest text-cyan-400">
          Settings
        </p>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
          {SETTING_FIELDS.map((field) => (
            <label key={field.key} className="rounded-xl bg-slate-900 p-4">
              <span className="block text-[10px] font-black uppercase tracking-wider text-slate-400">
                {field.label}
              </span>
              <input
                type="number"
                min={field.min}
                max={field.max}
                value={settings[field.key]}
                onChange={(event) => changeSetting(field.key, event.target.value)}
                className="mt-1 w-full bg-transparent text-3xl font-black outline-none"
              />
            </label>
          ))}
        </div>

        <p className="mt-4 text-sm text-slate-300">
          {teams.length < 2 ? (
            "Add at least 2 teams to see the plan."
          ) : (
            <>
              <strong>{teams.length} teams</strong> →{" "}
              {pools.length} pool{pools.length === 1 ? "" : "s"} (
              {pools.map((p) => p.length).join(", ")} teams) ·{" "}
              {preview.poolMatches} pool matches ·{" "}
              {preview.qualifiers >= 2
                ? `${preview.qualifiers}-team playoff (${preview.playoffMatches} matches)`
                : "no playoff"}
            </>
          )}
        </p>
      </section>

      {/* ADD TEAM */}
      <section className="rounded-2xl bg-white p-6 shadow ring-1 ring-slate-200">
        <p className="text-xs font-black uppercase tracking-widest text-cyan-600">
          Add team
        </p>
        <p className="mt-1 text-sm text-slate-500">
          Type a player's name. Registered players are suggested
          and linked to their account (so they get alerts);
          anyone else is added as a guest.
        </p>

        <datalist id="tournament-player-names">
          {profiles.map((p) => (
            <option key={p.playerId} value={p.name} />
          ))}
        </datalist>

        <div className="mt-4 grid gap-3 md:grid-cols-[1fr_1fr_1fr_auto]">
          {nameInput(playerA, setPlayerA, "Player 1")}
          {nameInput(playerB, setPlayerB, "Player 2")}
          <input
            value={teamName}
            onChange={(event) => setTeamName(event.target.value)}
            placeholder="Team name (optional)"
            disabled={busy}
            className="rounded-xl border border-slate-300 bg-white px-4 py-3 font-bold text-slate-950 outline-none focus:border-cyan-500"
          />
          <button
            type="button"
            disabled={busy || !playerA.trim() || !playerB.trim()}
            onClick={() => void handleAddTeam()}
            className="rounded-xl bg-cyan-600 px-5 py-3 font-black text-white hover:bg-cyan-500 disabled:opacity-50"
          >
            ADD TEAM
          </button>
        </div>

        {(playerA.trim() || playerB.trim()) && (
          <p className="mt-2 text-xs font-bold text-slate-500">
            {[playerA, playerB]
              .filter((n) => n.trim())
              .map((n) => `${n.trim()}: ${linked(n) ? "registered ✓" : "guest"}`)
              .join(" · ")}
          </p>
        )}
      </section>

      {/* TEAMS + SEEDING */}
      <section className="rounded-2xl bg-white p-6 shadow ring-1 ring-slate-200">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-cyan-600">
              Teams & seeding
            </p>
            <p className="mt-1 text-sm text-slate-500">
              Seed 1 is the strongest. Seeds decide pools and
              playoff order.
            </p>
          </div>

          <button
            type="button"
            disabled={teams.length < 2}
            onClick={seedBySkill}
            className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-black text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            SEED BY SKILL
          </button>
        </div>

        {teams.length === 0 ? (
          <p className="mt-4 rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
            No teams yet.
          </p>
        ) : (
          <ol className="mt-4 space-y-2">
            {teams.map((team, index) => (
              <li
                key={team.id}
                className="flex items-center gap-3 rounded-xl border border-slate-200 px-4 py-3"
              >
                <span className="w-8 shrink-0 text-center text-lg font-black text-cyan-600">
                  {team.seed}
                </span>

                <div className="min-w-0 flex-1">
                  <p className="truncate font-black">{team.name}</p>
                  <p className="truncate text-xs text-slate-500">
                    {team.members
                      .map((m) => `${m.name}${m.playerId ? "" : " (guest)"}`)
                      .join(" · ")}
                    {teams.length >= 2 && (
                      <> · {poolName(pools.findIndex((p) => p.includes(team.id)))}</>
                    )}
                  </p>
                </div>

                <div className="flex shrink-0 gap-1">
                  <button
                    type="button"
                    aria-label={`Move ${team.name} up`}
                    disabled={index === 0}
                    onClick={() => move(index, -1)}
                    className="rounded-lg px-2 py-1 font-black text-slate-500 hover:bg-slate-100 disabled:opacity-30"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    aria-label={`Move ${team.name} down`}
                    disabled={index === teams.length - 1}
                    onClick={() => move(index, 1)}
                    className="rounded-lg px-2 py-1 font-black text-slate-500 hover:bg-slate-100 disabled:opacity-30"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    aria-label={`Remove ${team.name}`}
                    onClick={() => void run(() => removeTeam(team.id))}
                    className="rounded-lg px-2 py-1 text-xs font-black text-red-500 hover:bg-red-50"
                  >
                    REMOVE
                  </button>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      <button
        type="button"
        disabled={busy || teams.length < 2}
        onClick={() => void handleStart()}
        className="w-full rounded-xl bg-emerald-500 px-5 py-4 text-lg font-black text-white hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-slate-300"
      >
        START TOURNAMENT
      </button>

      <button
        type="button"
        onClick={handleDelete}
        className="w-full rounded-xl px-5 py-3 text-sm font-bold text-red-600 hover:bg-red-50"
      >
        Delete tournament
      </button>
    </div>
  );
}
