import { useEffect, useState } from "react";

import PairRulesEditor from "./PairRulesEditor";
import {
  addGuestPlayerToSession,
  addSessionPair,
  linkGuestPlayerToAccount,
  removePlayerFromSession,
  removeSessionPair,
  setSkillBalance,
  type OpenPlayState,
} from "../lib/game";
import {
  formatSkillLevel,
  getAllPlayerProfiles,
  SKILL_LEVELS,
  type PlayerProfile,
  type SkillLevel,
} from "../lib/player";
import type { QueuePlayer } from "../lib/queue";

type SessionPlayerStatus = {
  label: string;
  type: "playing" | "next" | "waiting" | "break";
};

type ManagePlayersModalProps = {
  game: OpenPlayState;
  onClose: () => void;
  getSessionPlayerStatus: (playerId: string) => SessionPlayerStatus;
  getFixedPartner: (playerId: string) => QueuePlayer | null;
  onBreakIds: Set<string>;
  savingBreakId: string | null;
  onToggleBreak: (playerId: string, onBreak: boolean) => Promise<void>;
};

export default function ManagePlayersModal({
  game,
  onClose,
  getSessionPlayerStatus,
  getFixedPartner,
  onBreakIds,
  savingBreakId,
  onToggleBreak,
}: ManagePlayersModalProps) {
  const [addingGuestPlayer, setAddingGuestPlayer] = useState(false);

  const [removingPlayerId, setRemovingPlayerId] = useState<string | null>(null);

  const [registeredProfiles, setRegisteredProfiles] = useState<PlayerProfile[]>(
    [],
  );

  const [linkingGuestId, setLinkingGuestId] = useState<string | null>(null);

  const [selectedLinkAccountId, setSelectedLinkAccountId] =
    useState<string>("");

  const [savingGuestLink, setSavingGuestLink] = useState(false);

  const [guestPlayerName, setGuestPlayerName] = useState("");

  const [guestSkillLevel, setGuestSkillLevel] = useState<SkillLevel>(3.0);

  useEffect(() => {
    void getAllPlayerProfiles()
      .then((profiles) => {
        setRegisteredProfiles(
          profiles.sort((a, b) => a.name.localeCompare(b.name)),
        );
      })
      .catch((error) => {
        console.error("Unable to load registered player accounts:", error);
      });
  }, []);

  const handleAddGuestPlayer = async () => {
    if (!guestPlayerName.trim()) {
      alert("Please enter the player's name.");
      return;
    }

    setAddingGuestPlayer(true);

    try {
      await addGuestPlayerToSession(guestPlayerName, guestSkillLevel);

      setGuestPlayerName("");
      setGuestSkillLevel(3.0);
    } catch (error) {
      console.error("Unable to add guest player:", error);

      alert(error instanceof Error ? error.message : "Unable to add player.");
    } finally {
      setAddingGuestPlayer(false);
    }
  };

  const handleLinkGuestPlayer = async (guestPlayerId: string) => {
    if (!selectedLinkAccountId) {
      alert("Choose a registered account first.");
      return;
    }

    const profile = registeredProfiles.find(
      (item) => item.playerId === selectedLinkAccountId,
    );

    if (!profile) {
      alert("Registered player account not found.");
      return;
    }

    const confirmed = window.confirm(
      `Link this guest to ${profile.name}'s registered account? The guest's current-session games and stats will move to that account.`,
    );

    if (!confirmed) {
      return;
    }

    setSavingGuestLink(true);

    try {
      await linkGuestPlayerToAccount(guestPlayerId, {
        id: profile.playerId,
        name: profile.name,
        skillLevel: profile.skillLevel,
        joinedAt: Date.now(),
      });

      setLinkingGuestId(null);
      setSelectedLinkAccountId("");
    } catch (error) {
      console.error("Unable to link guest account:", error);

      alert(
        error instanceof Error
          ? error.message
          : "Unable to link guest account.",
      );
    } finally {
      setSavingGuestLink(false);
    }
  };

  const handleRemoveSessionPlayer = async (
    playerId: string,
    playerName: string,
  ) => {
    const status = getSessionPlayerStatus(playerId);

    if (status.type === "playing") {
      alert(
        `${playerName} is currently playing. Use EDIT PLAYERS & TEAMS first to replace this player.`,
      );

      return;
    }

    const confirmed = window.confirm(`Remove ${playerName} from this session?`);

    if (!confirmed) {
      return;
    }

    setRemovingPlayerId(playerId);

    try {
      await removePlayerFromSession(playerId);
    } catch (error) {
      console.error("Unable to remove player:", error);

      alert(
        error instanceof Error ? error.message : "Unable to remove player.",
      );
    } finally {
      setRemovingPlayerId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/80 p-4">
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white text-slate-950 shadow-2xl">
        {/* HEADER */}
        <div className="flex items-start justify-between border-b border-slate-200 p-6">
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-amber-600">
              Admin
            </p>

            <h2 className="mt-1 text-2xl font-black">Manage Players</h2>

            <p className="mt-1 text-sm text-slate-500">
              Add guests, set fixed pairs, or remove players from this open-play
              session.
            </p>
          </div>

          <button
            type="button"
            onClick={() => onClose()}
            className="rounded-lg bg-slate-100 px-3 py-2 font-black text-slate-500 hover:bg-slate-200"
          >
            ✕
          </button>
        </div>

        <div className="overflow-y-auto p-6">
          {/* ADD GUEST */}
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
            <p className="text-xs font-black uppercase tracking-widest text-amber-700">
              + Add Guest Player
            </p>

            <div className="mt-4 grid gap-3 md:grid-cols-[1fr_160px_auto]">
              <input
                type="text"
                value={guestPlayerName}
                onChange={(event) => setGuestPlayerName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    void handleAddGuestPlayer();
                  }
                }}
                placeholder="Player name"
                className="rounded-xl border border-amber-200 bg-white px-4 py-3 font-bold outline-none focus:border-amber-500"
              />

              <select
                value={String(guestSkillLevel)}
                onChange={(event) => {
                  const raw = event.target.value;

                  setGuestSkillLevel(
                    raw === "5.0+" ? "5.0+" : (Number(raw) as SkillLevel),
                  );
                }}
                className="rounded-xl border border-amber-200 bg-white px-4 py-3 font-bold outline-none focus:border-amber-500"
              >
                {SKILL_LEVELS.map((level) => (
                  <option key={String(level)} value={String(level)}>
                    {formatSkillLevel(level)}
                  </option>
                ))}
              </select>

              <button
                type="button"
                disabled={addingGuestPlayer || !guestPlayerName.trim()}
                onClick={() => void handleAddGuestPlayer()}
                className="rounded-xl bg-amber-500 px-5 py-3 font-black text-slate-950 hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {addingGuestPlayer ? "ADDING..." : "ADD PLAYER"}
              </button>
            </div>
          </div>

          {/* SKILL BALANCE */}
          <label className="mt-6 flex cursor-pointer items-start gap-3 rounded-2xl border border-cyan-200 bg-cyan-50 p-5">
            <input
              type="checkbox"
              checked={game.skillBalance === true}
              onChange={(event) =>
                void setSkillBalance(event.target.checked).catch((error) => {
                  console.error("Unable to update skill balance:", error);
                  alert("Unable to update skill balance.");
                })
              }
              className="mt-1 h-5 w-5 accent-cyan-600"
            />
            <span>
              <span className="block font-black">Balance teams by skill</span>
              <span className="mt-1 block text-sm text-slate-500">
                Applies from the next rotation.
              </span>
            </span>
          </label>

          {/* FIXED PAIRS */}
          <div className="mt-6 space-y-4">
            <PairRulesEditor
              kind="fixed"
              players={game.players}
              pairs={game.fixedPairs ?? []}
              description="Paired players always go on court together as teammates, starting with the next rotation."
              onAdd={(a, b) => addSessionPair("fixed", a, b)}
              onRemove={(pair) => removeSessionPair("fixed", pair)}
            />

            <PairRulesEditor
              kind="keepApart"
              players={game.players}
              pairs={game.keepApartPairs ?? []}
              description="These players will never be put on the same team, starting with the next rotation. They can still play against each other."
              onAdd={(a, b) => addSessionPair("keepApart", a, b)}
              onRemove={(pair) => removeSessionPair("keepApart", pair)}
            />
          </div>

          {/* SESSION PLAYERS */}
          <div className="mt-6">
            <div className="flex items-center justify-between">
              <p className="text-xs font-black uppercase tracking-widest text-slate-500">
                Session Players
              </p>

              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black">
                {game.players.length}
              </span>
            </div>

            <div className="mt-3 space-y-2">
              {game.players.map((player) => {
                const status = getSessionPlayerStatus(player.id);

                const isGuest = player.id.startsWith("guest_");

                const isPlaying = status.type === "playing";

                const isRemoving = removingPlayerId === player.id;

                return (
                  <div
                    key={player.id}
                    className="flex flex-col gap-3 rounded-xl border border-slate-200 p-4 sm:flex-row sm:items-center"
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-900 font-black text-white">
                        {player.name.charAt(0).toUpperCase()}
                      </div>

                      <div className="min-w-0">
                        <p className="truncate font-black">{player.name}</p>

                        <div className="mt-1 flex flex-wrap gap-2 text-[10px] font-black uppercase">
                          <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-600">
                            {formatSkillLevel(player.skillLevel)}
                          </span>

                          <span
                            className={
                              isGuest
                                ? "rounded-full bg-amber-100 px-2 py-1 text-amber-700"
                                : "rounded-full bg-blue-100 px-2 py-1 text-blue-700"
                            }
                          >
                            {isGuest ? "Guest" : "Account"}
                          </span>

                          <span
                            className={
                              status.type === "playing"
                                ? "rounded-full bg-emerald-100 px-2 py-1 text-emerald-700"
                                : status.type === "next"
                                  ? "rounded-full bg-orange-100 px-2 py-1 text-orange-700"
                                  : "rounded-full bg-slate-100 px-2 py-1 text-slate-600"
                            }
                          >
                            {status.label}
                          </span>

                          {getFixedPartner(player.id) && (
                            <span className="rounded-full bg-violet-100 px-2 py-1 text-violet-700">
                              Paired w/ {getFixedPartner(player.id)?.name}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col gap-2 sm:items-end">
                      {isGuest && (
                        <>
                          {linkingGuestId === player.id ? (
                            <div className="flex flex-col gap-2 sm:flex-row">
                              <select
                                value={selectedLinkAccountId}
                                onChange={(event) =>
                                  setSelectedLinkAccountId(event.target.value)
                                }
                                disabled={savingGuestLink}
                                className="max-w-[240px] rounded-lg border border-blue-200 bg-white px-3 py-2 text-xs font-bold outline-none focus:border-blue-500"
                              >
                                <option value="">
                                  Select registered account
                                </option>

                                {registeredProfiles
                                  .filter(
                                    (profile) =>
                                      !game.players.some(
                                        (sessionPlayer) =>
                                          sessionPlayer.id === profile.playerId,
                                      ),
                                  )
                                  .map((profile) => (
                                    <option
                                      key={profile.playerId}
                                      value={profile.playerId}
                                    >
                                      {profile.name} ·{" "}
                                      {formatSkillLevel(profile.skillLevel)}
                                    </option>
                                  ))}
                              </select>

                              <button
                                type="button"
                                disabled={
                                  savingGuestLink || !selectedLinkAccountId
                                }
                                onClick={() =>
                                  void handleLinkGuestPlayer(player.id)
                                }
                                className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-black text-white hover:bg-blue-500 disabled:opacity-50"
                              >
                                {savingGuestLink ? "LINKING..." : "CONFIRM"}
                              </button>

                              <button
                                type="button"
                                disabled={savingGuestLink}
                                onClick={() => {
                                  setLinkingGuestId(null);
                                  setSelectedLinkAccountId("");
                                }}
                                className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-black text-slate-500 hover:bg-slate-50"
                              >
                                CANCEL
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                setLinkingGuestId(player.id);
                                setSelectedLinkAccountId("");
                              }}
                              className="rounded-lg border border-blue-200 px-4 py-2 text-xs font-black text-blue-600 hover:bg-blue-50"
                            >
                              LINK ACCOUNT
                            </button>
                          )}
                        </>
                      )}

                      <button
                        type="button"
                        disabled={savingBreakId === player.id}
                        onClick={() =>
                          void onToggleBreak(
                            player.id,
                            !onBreakIds.has(player.id),
                          )
                        }
                        className="rounded-lg border border-amber-200 px-4 py-2 text-xs font-black text-amber-700 hover:bg-amber-50 disabled:opacity-50"
                      >
                        {onBreakIds.has(player.id) ? "END BREAK" : "BREAK"}
                      </button>

                      <button
                        type="button"
                        disabled={isPlaying || isRemoving || savingGuestLink}
                        onClick={() =>
                          void handleRemoveSessionPlayer(player.id, player.name)
                        }
                        className="rounded-lg border border-red-200 px-4 py-2 text-xs font-black text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-300"
                      >
                        {isPlaying
                          ? "ON COURT"
                          : isRemoving
                            ? "REMOVING..."
                            : "REMOVE"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* FOOTER */}

        <div className="border-t border-slate-200 p-4">
          <button
            type="button"
            onClick={() => onClose()}
            className="w-full rounded-xl bg-slate-950 px-5 py-3 font-black text-white hover:bg-slate-800"
          >
            DONE
          </button>
        </div>
      </div>
    </div>
  );
}
