import { useState } from "react";

import { updateCourtLineup, type OpenPlayState } from "../lib/game";

type CourtEditorModalProps = {
  game: OpenPlayState;
  courtNumber: number;
  onClose: () => void;
};

export default function CourtEditorModal({
  game,
  courtNumber,
  onClose,
}: CourtEditorModalProps) {
  // Start from the lineup currently on this court.
  const [adminLineupIds, setAdminLineupIds] = useState<string[]>(() =>
    (
      game.courts.find((court) => court.courtNumber === courtNumber)?.players ??
      []
    ).map((player) => player.id),
  );

  const [savingAdminLineup, setSavingAdminLineup] = useState(false);

  const handleCloseCourtEditor = () => {
    if (savingAdminLineup) {
      return;
    }

    onClose();
  };

  const handleAdminLineupChange = (slotIndex: number, playerId: string) => {
    setAdminLineupIds((current) => {
      const next = [...current];

      next[slotIndex] = playerId;

      return next;
    });
  };

  const getAdminPlayerStatus = (playerId: string) => {
    const playingCourt = game.courts.find(
      (court) =>
        court.status === "playing" &&
        court.players.some((player) => player.id === playerId),
    );

    if (playingCourt) {
      const isEditingThisCourt = playingCourt.courtNumber === courtNumber;

      return {
        label: `COURT ${playingCourt.courtNumber}`,
        unavailable: !isEditingThisCourt,
      };
    }

    const waitingIndex = (game.waitingPlayers ?? []).findIndex(
      (player) => player.id === playerId,
    );

    if (waitingIndex >= 0) {
      const nextCount = 4;

      if (waitingIndex < nextCount) {
        return {
          label: `UP NEXT #${waitingIndex + 1}`,
          unavailable: false,
        };
      }

      return {
        label: `WAITING #${waitingIndex + 1}`,
        unavailable: false,
      };
    }

    return {
      label: "AVAILABLE",
      unavailable: false,
    };
  };

  const handleSaveAdminLineup = async () => {
    if (adminLineupIds.length !== 4) {
      alert("Please select exactly 4 players.");

      return;
    }

    if (adminLineupIds.some((playerId) => !playerId)) {
      alert("Please select a player for every position.");

      return;
    }

    if (new Set(adminLineupIds).size !== 4) {
      alert("The same player cannot be selected twice.");

      return;
    }

    setSavingAdminLineup(true);

    try {
      await updateCourtLineup(courtNumber, adminLineupIds);

      onClose();
    } catch (error) {
      console.error("Unable to update court lineup:", error);

      alert(
        `Unable to update court lineup.\n\n${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    } finally {
      setSavingAdminLineup(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/80 p-4">
      <div className="w-full max-w-2xl rounded-2xl bg-white p-6 text-slate-950 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-amber-600">
              Admin Override
            </p>

            <h2 className="mt-1 text-2xl font-black">
              Edit Court {courtNumber}
            </h2>

            <p className="mt-2 text-sm text-slate-500">
              Choose the four players and manually set the partnerships.
            </p>
          </div>

          <button
            type="button"
            disabled={savingAdminLineup}
            onClick={handleCloseCourtEditor}
            className="rounded-lg bg-slate-100 px-3 py-2 font-black text-slate-500 hover:bg-slate-200"
          >
            ✕
          </button>
        </div>

        <div className="mt-6 grid gap-5 md:grid-cols-2">
          {/* TEAM A */}
          <div className="rounded-2xl border border-cyan-200 bg-cyan-50 p-4">
            <p className="text-xs font-black uppercase tracking-widest text-cyan-700">
              Team A
            </p>

            <div className="mt-4 space-y-3">
              {[0, 1].map((slotIndex) => (
                <select
                  key={slotIndex}
                  value={adminLineupIds[slotIndex] ?? ""}
                  onChange={(event) =>
                    handleAdminLineupChange(slotIndex, event.target.value)
                  }
                  className="w-full rounded-xl border border-cyan-200 bg-white px-4 py-3 font-bold outline-none focus:border-cyan-500"
                >
                  <option value="">Select player</option>

                  {game?.players.map((player) => {
                    const status = getAdminPlayerStatus(player.id);

                    const alreadySelected = adminLineupIds.some(
                      (selectedId, selectedIndex) =>
                        selectedId === player.id && selectedIndex !== slotIndex,
                    );

                    const disabled = status.unavailable || alreadySelected;

                    return (
                      <option
                        key={player.id}
                        value={player.id}
                        disabled={disabled}
                      >
                        {player.name}
                        {" — "}
                        {status.label}
                        {alreadySelected ? " — SELECTED" : ""}
                      </option>
                    );
                  })}
                </select>
              ))}
            </div>
          </div>

          {/* TEAM B */}
          <div className="rounded-2xl border border-violet-200 bg-violet-50 p-4">
            <p className="text-xs font-black uppercase tracking-widest text-violet-700">
              Team B
            </p>

            <div className="mt-4 space-y-3">
              {[2, 3].map((slotIndex) => (
                <select
                  key={slotIndex}
                  value={adminLineupIds[slotIndex] ?? ""}
                  onChange={(event) =>
                    handleAdminLineupChange(slotIndex, event.target.value)
                  }
                  className="w-full rounded-xl border border-violet-200 bg-white px-4 py-3 font-bold outline-none focus:border-violet-500"
                >
                  <option value="">Select player</option>

                  {game?.players.map((player) => (
                    <option key={player.id} value={player.id}>
                      {player.name}
                    </option>
                  ))}
                </select>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-6 rounded-xl bg-slate-100 p-4 text-xs leading-5 text-slate-600">
          Player 1 + Player 2 become Team A. Player 3 + Player 4 become Team B.
          Waiting players can be moved onto the court. Replaced players return
          to the waiting queue.
        </div>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            disabled={savingAdminLineup}
            onClick={handleCloseCourtEditor}
            className="flex-1 rounded-xl border border-slate-300 px-5 py-3 font-black text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            CANCEL
          </button>

          <button
            type="button"
            disabled={savingAdminLineup}
            onClick={() => void handleSaveAdminLineup()}
            className="flex-1 rounded-xl bg-amber-500 px-5 py-3 font-black text-slate-950 hover:bg-amber-400 disabled:opacity-50"
          >
            {savingAdminLineup ? "SAVING..." : "SAVE LINEUP"}
          </button>
        </div>
      </div>
    </div>
  );
}
