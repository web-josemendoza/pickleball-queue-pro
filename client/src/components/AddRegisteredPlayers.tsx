import { useEffect, useMemo, useState } from "react";

import {
  formatSkillLevel,
  getAllPlayerProfiles,
  type PlayerProfile,
} from "../lib/player";
import {
  addPlayersToQueue,
  type QueuePlayer,
} from "../lib/queue";

type AddRegisteredPlayersProps = {
  // Players already in the queue are not offered again.
  queuePlayers: QueuePlayer[];
};

/*
 * Lets an admin put registered players into the queue
 * before open play starts, e.g. players without a phone.
 */
export default function AddRegisteredPlayers({
  queuePlayers,
}: AddRegisteredPlayersProps) {
  const [profiles, setProfiles] = useState<PlayerProfile[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void getAllPlayerProfiles()
      .then((all) =>
        setProfiles(
          all.sort((a, b) => a.name.localeCompare(b.name))
        )
      )
      .catch((error) => {
        console.error("Unable to load registered players:", error);
        setLoadError(true);
      });
  }, []);

  const queuedIds = useMemo(
    () => new Set(queuePlayers.map((player) => player.id)),
    [queuePlayers]
  );

  const available = useMemo(
    () =>
      (profiles ?? []).filter(
        (profile) => !queuedIds.has(profile.playerId)
      ),
    [profiles, queuedIds]
  );

  const query = search.trim().toLowerCase();

  const shown = query
    ? available.filter((profile) =>
        profile.name.toLowerCase().includes(query)
      )
    : available;

  // Someone may join from their own phone meanwhile.
  const selectedAvailable = selected.filter((id) =>
    available.some((profile) => profile.playerId === id)
  );

  const toggle = (playerId: string) =>
    setSelected((current) =>
      current.includes(playerId)
        ? current.filter((id) => id !== playerId)
        : [...current, playerId]
    );

  const handleAdd = async () => {
    // Added in the order they were ticked.
    const chosen = selectedAvailable
      .map((id) =>
        available.find((profile) => profile.playerId === id)
      )
      .filter((profile): profile is PlayerProfile => !!profile);

    if (chosen.length === 0) {
      return;
    }

    setSaving(true);

    try {
      await addPlayersToQueue(
        chosen.map((profile) => ({
          playerId: profile.playerId,
          name: profile.name,
          skillLevel: profile.skillLevel,
        }))
      );

      setSelected([]);
      setSearch("");
    } catch (error) {
      console.error("Unable to add players to the queue:", error);
      alert("Unable to add players to the queue. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-slate-950">
      <p className="text-xs font-black uppercase tracking-widest text-emerald-700">
        Add Registered Players
      </p>

      <p className="mt-1 text-sm text-emerald-900/70">
        Put players with an account into the queue yourself,
        for example if they don't have their phone.
      </p>

      {loadError ? (
        <p className="mt-4 text-sm font-bold text-red-600">
          Couldn't load registered players. Refresh and try again.
        </p>
      ) : profiles === null ? (
        <p className="mt-4 text-sm text-slate-500">Loading players…</p>
      ) : available.length === 0 ? (
        <p className="mt-4 text-sm font-bold text-emerald-800">
          Every registered player is already in the queue.
        </p>
      ) : (
        <>
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={`Search ${available.length} players`}
            className="mt-4 w-full rounded-xl border border-emerald-200 bg-white px-4 py-3 font-bold outline-none focus:border-emerald-500"
          />

          <div className="mt-3 max-h-64 space-y-1 overflow-y-auto rounded-xl bg-white p-2 ring-1 ring-emerald-200">
            {shown.length === 0 ? (
              <p className="p-3 text-sm text-slate-500">
                No players match "{search}".
              </p>
            ) : (
              shown.map((profile) => {
                const checked = selected.includes(profile.playerId);

                return (
                  <label
                    key={profile.playerId}
                    className={`flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 ${
                      checked ? "bg-emerald-100" : "hover:bg-slate-50"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(profile.playerId)}
                      className="h-5 w-5 accent-emerald-600"
                    />
                    <span className="min-w-0 flex-1 truncate font-bold">
                      {profile.name}
                    </span>
                    <span className="shrink-0 text-xs font-bold text-slate-500">
                      {formatSkillLevel(profile.skillLevel)}
                    </span>
                  </label>
                );
              })
            )}
          </div>

          <button
            type="button"
            disabled={saving || selectedAvailable.length === 0}
            onClick={() => void handleAdd()}
            className="mt-3 w-full rounded-xl bg-emerald-600 px-5 py-3 font-black text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving
              ? "ADDING..."
              : selectedAvailable.length === 0
                ? "SELECT PLAYERS TO ADD"
                : `ADD ${selectedAvailable.length} PLAYER${
                    selectedAvailable.length === 1 ? "" : "S"
                  } TO QUEUE`}
          </button>
        </>
      )}
    </div>
  );
}
