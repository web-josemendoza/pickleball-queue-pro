import { useEffect, useState, type ChangeEvent } from "react";

import PairRulesEditor from "./PairRulesEditor";
import { createInitialCycle } from "../lib/fourOnFour";
import {
  addPendingPair,
  removePendingPair,
  startOpenPlay,
  subscribeToPendingPairRules,
  type PairRules,
} from "../lib/game";
import type { QueuePlayer } from "../lib/queue";
import {
  calculateSessionEndTime,
  validateSession,
  type OpenPlaySession,
} from "../lib/session";

type ConfigureOpenPlayProps = {
  players: QueuePlayer[];
  registeredPlayerCount: number;
};

// Admin-only setup panel shown before a session starts.
export default function ConfigureOpenPlay({
  players,
  registeredPlayerCount,
}: ConfigureOpenPlayProps) {
  const [setupCourtCount, setSetupCourtCount] = useState("1");

  const [setupDurationHours, setSetupDurationHours] = useState("1");

  const [startingOpenPlay, setStartingOpenPlay] = useState(false);

  const [pendingPairRules, setPendingPairRules] = useState<PairRules>({
    fixedPairs: [],
    keepApartPairs: [],
  });

  const [setupSkillBalance, setSetupSkillBalance] = useState(false);

  useEffect(() => {
    return subscribeToPendingPairRules(setPendingPairRules);
  }, []);

  const handleStartOpenPlay = async () => {
    const playerCount = players.length;
    const courtCount = Number(setupCourtCount);
    const durationHours = Number(setupDurationHours);

    if (!Number.isInteger(courtCount) || courtCount < 1) {
      alert("You need at least 1 available court.");
      return;
    }

    if (!Number.isFinite(durationHours) || durationHours < 1) {
      alert("Open play must be at least 1 hour.");
      return;
    }

    const startedAt = Date.now();

    const session: OpenPlaySession = {
      playerCount,
      courtCount,
      durationHours,
      rotationMode: "4_ON_4_OFF",
      startedAt,
      endsAt: calculateSessionEndTime(startedAt, durationHours),
      status: "active",
    };

    const validationErrors = validateSession(session);

    if (validationErrors.length > 0) {
      alert(validationErrors.join("\n"));
      return;
    }

    const playablePlayerCount = courtCount * 4;

    if (playerCount < playablePlayerCount) {
      alert(
        `You need at least ${playablePlayerCount} players to fill ${courtCount} courts.`,
      );
      return;
    }

    const initialCycle = createInitialCycle(players, courtCount, 1);

    if (initialCycle.courts.length !== courtCount) {
      alert(
        "Unable to create a complete first cycle. Check the player and court counts.",
      );
      return;
    }

    setStartingOpenPlay(true);

    try {
      await startOpenPlay(playerCount, courtCount, durationHours, players, {
        ...pendingPairRules,
        skillBalance: setupSkillBalance,
      });
    } catch (error) {
      console.error("Unable to start open play:", error);
      alert(
        `Unable to start open play.\n\n${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    } finally {
      setStartingOpenPlay(false);
    }
  };

  return (
    <section className="rounded-2xl bg-slate-950 p-6 text-white shadow-xl">
      <p className="text-xs font-black uppercase tracking-widest text-cyan-400">
        Before Starting
      </p>
      <h2 className="mt-1 text-3xl font-black">Configure Open Play</h2>
      <p className="mt-2 max-w-2xl text-slate-400">
        The player count is taken directly from the registered queue. Choose the
        number of available courts and the open-play duration.
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl bg-slate-900 p-5">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
            Players
          </p>
          <p className="mt-1 text-4xl font-black text-white">
            {registeredPlayerCount}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Minimum: {Math.max(1, Number(setupCourtCount)) * 4}
          </p>
        </div>

        <label className="rounded-xl bg-slate-900 p-5">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
            Courts
          </span>
          <input
            type="number"
            min="1"
            step="1"
            value={setupCourtCount}
            onChange={(event: ChangeEvent<HTMLInputElement>) =>
              setSetupCourtCount(event.target.value)
            }
            className="mt-1 w-full bg-transparent text-4xl font-black text-white outline-none"
          />
          <span className="text-xs text-slate-500">Minimum: 1</span>
        </label>

        <label className="rounded-xl bg-slate-900 p-5">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
            Hours
          </span>
          <input
            type="number"
            min="1"
            step="0.5"
            value={setupDurationHours}
            onChange={(event: ChangeEvent<HTMLInputElement>) =>
              setSetupDurationHours(event.target.value)
            }
            className="mt-1 w-full bg-transparent text-4xl font-black text-white outline-none"
          />
          <span className="text-xs text-slate-500">Minimum: 1</span>
        </label>
      </div>

      <div className="mt-5 rounded-xl border border-cyan-500/30 bg-cyan-500/10 p-4 text-sm text-cyan-100">
        <strong>Rotation:</strong> every court has 4 players. When a court
        finishes, the next 4 are chosen by fewest games played and longest wait,
        mixing partners and opponents as much as possible.
      </div>

      <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-xl bg-slate-900 p-4">
        <input
          type="checkbox"
          checked={setupSkillBalance}
          onChange={(event) => setSetupSkillBalance(event.target.checked)}
          className="mt-1 h-5 w-5 accent-cyan-500"
        />
        <span>
          <span className="block font-black text-white">
            Balance teams by skill
          </span>
          <span className="mt-1 block text-sm text-slate-400">
            Prefer evenly matched teams using player skill levels. Fair turns
            and partner variety still come first.
          </span>
        </span>
      </label>

      <div className="mt-5 space-y-4">
        <PairRulesEditor
          kind="fixed"
          players={players}
          pairs={pendingPairRules.fixedPairs}
          description="Pair players from the queue before starting. They will play together as teammates all session, including the first round."
          onAdd={(a, b) => addPendingPair("fixed", a, b)}
          onRemove={(pair) => removePendingPair("fixed", pair)}
        />

        <PairRulesEditor
          kind="keepApart"
          players={players}
          pairs={pendingPairRules.keepApartPairs}
          description="These players will never be put on the same team. They can still play against each other."
          onAdd={(a, b) => addPendingPair("keepApart", a, b)}
          onRemove={(pair) => removePendingPair("keepApart", pair)}
        />
      </div>

      <button
        type="button"
        onClick={() => void handleStartOpenPlay()}
        disabled={
          startingOpenPlay ||
          players.length < Math.max(1, Number(setupCourtCount)) * 4
        }
        className="mt-5 w-full rounded-xl bg-emerald-500 px-5 py-4 text-lg font-black text-white hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-500"
      >
        {startingOpenPlay ? "STARTING OPEN PLAY..." : "START OPEN PLAY"}
      </button>
    </section>
  );
}
