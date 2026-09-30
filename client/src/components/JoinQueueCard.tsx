import PlayerAuth from "./PlayerAuth";
import type { OpenPlayState } from "../lib/game";
import { formatSkillLevel, type PlayerProfile } from "../lib/player";

type JoinQueueCardProps = {
  game: OpenPlayState | null;
  playerProfile: PlayerProfile | null;
  myPlayerId: string | null;
  isMyPlayerRegistered: boolean;
  isMyPlayerOnCourt: boolean;
  loading: boolean;
  showAuth: boolean;
  setShowAuth: (show: boolean) => void;
  onAuthenticated: (userId: string) => Promise<void>;
  onJoin: () => Promise<void>;
  onLeave: () => Promise<void>;
  onSignOut: () => Promise<void>;
  onShowStats: () => void;
};

// Sign-in and join/leave controls on the setup screen.
export default function JoinQueueCard({
  game,
  playerProfile,
  myPlayerId,
  isMyPlayerRegistered,
  isMyPlayerOnCourt,
  loading,
  showAuth,
  setShowAuth,
  onAuthenticated,
  onJoin,
  onLeave,
  onSignOut,
  onShowStats,
}: JoinQueueCardProps) {
  return (
    <section className="rounded-2xl bg-white p-6 shadow-lg ring-1 ring-slate-200">
      <p className="text-xs font-black uppercase tracking-widest text-cyan-600">
        Player Registration
      </p>
      <h2 className="mt-1 text-2xl font-black">Join the Queue</h2>
      <p className="mt-2 text-sm text-slate-500">
        Players registered here become part of the open-play player pool.
      </p>

      {!playerProfile ? (
        <div className="mt-5">
          {!showAuth ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
              <p className="text-sm font-black text-amber-900">
                Player account required
              </p>

              <p className="mt-1 text-xs leading-5 text-amber-700">
                Create an account or sign in before joining Open Play.
              </p>

              <button
                type="button"
                onClick={() => setShowAuth(true)}
                className="mt-4 w-full rounded-xl bg-slate-950 px-4 py-3 font-black text-white hover:bg-slate-800"
              >
                CREATE ACCOUNT / LOGIN
              </button>
            </div>
          ) : (
            <div className="mt-4">
              <PlayerAuth onAuthenticated={onAuthenticated} />

              <button
                type="button"
                onClick={() => setShowAuth(false)}
                className="mt-3 w-full rounded-xl border border-slate-300 px-4 py-3 font-bold text-slate-700"
              >
                CANCEL
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-950 font-black text-white">
              {playerProfile.name
                .split(" ")
                .filter(Boolean)
                .map((part) => part[0])
                .slice(0, 2)
                .join("")
                .toUpperCase()}
            </div>

            <div className="min-w-0">
              <p className="truncate text-lg font-black">
                {playerProfile.name}
              </p>

              <p className="text-sm font-bold text-cyan-600">
                Skill Level {formatSkillLevel(playerProfile.skillLevel)}
              </p>

              {playerProfile.email && (
                <p className="truncate text-xs text-slate-500">
                  {playerProfile.email}
                </p>
              )}
            </div>
          </div>

          <div className="mt-4 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-700">
            ✓ SIGNED IN
          </div>

          {myPlayerId && (
            <button
              type="button"
              onClick={() => onShowStats()}
              className="mt-3 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-xs font-black uppercase tracking-wider text-slate-700 hover:bg-slate-100"
            >
              📊 My Stats
            </button>
          )}

          <button
            type="button"
            onClick={() => void onSignOut()}
            className="mt-2 w-full rounded-xl px-4 py-2 text-xs font-bold text-slate-500 hover:bg-slate-100"
          >
            Sign out
          </button>
        </div>
      )}
      <button
        type="button"
        onClick={() => void onJoin()}
        disabled={
          loading ||
          game?.status === "active" ||
          !myPlayerId ||
          !playerProfile ||
          isMyPlayerRegistered
        }
        className="mt-4 w-full rounded-xl bg-emerald-500 px-4 py-3 font-black text-white hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-slate-300"
      >
        {loading
          ? "JOINING..."
          : isMyPlayerRegistered
            ? "✓ IN QUEUE"
            : "JOIN QUEUE"}
      </button>

      <button
        type="button"
        onClick={() => void onLeave()}
        disabled={!isMyPlayerRegistered || isMyPlayerOnCourt}
        className="mt-3 w-full rounded-xl border border-slate-300 px-4 py-3 font-bold text-slate-700 disabled:opacity-50"
      >
        {isMyPlayerOnCourt ? "CURRENTLY PLAYING" : "LEAVE QUEUE"}
      </button>
    </section>
  );
}
