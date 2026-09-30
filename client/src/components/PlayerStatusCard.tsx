type PlayerStatusCardProps = {
  myPlayerId: string | null;
  myCourtNumber: number | null;
  myWaitingPosition: number | null;
  upNextCount: number;
  isMyPlayerRegistered: boolean;
  isMyPlayerOnCourt: boolean;
  isMyPlayerOnBreak: boolean;
  savingBreakId: string | null;
  alertsEnabled: boolean;
  enableAlerts: () => Promise<void>;
  disableAlerts: () => void;
  onToggleBreak: (playerId: string, onBreak: boolean) => Promise<void>;
  onShowStats: () => void;
};

export default function PlayerStatusCard({
  myPlayerId,
  myCourtNumber,
  myWaitingPosition,
  upNextCount,
  isMyPlayerRegistered,
  isMyPlayerOnCourt,
  isMyPlayerOnBreak,
  savingBreakId,
  alertsEnabled,
  enableAlerts,
  disableAlerts,
  onToggleBreak,
  onShowStats,
}: PlayerStatusCardProps) {
  return (
    <section className="rounded-2xl bg-white p-5 shadow ring-1 ring-slate-200">
      <p className="text-xs font-black uppercase tracking-widest text-slate-500">
        Player Status
      </p>
      <p className="mt-2 text-sm font-semibold text-slate-700">
        {myCourtNumber !== null
          ? `You are currently playing on Court ${myCourtNumber}.`
          : isMyPlayerOnBreak
            ? "You are ON BREAK. You won't be called until you come back."
            : myWaitingPosition !== null
              ? myWaitingPosition <= upNextCount
                ? `You are UP NEXT #${myWaitingPosition}.`
                : `You are WAITING #${myWaitingPosition}.`
              : isMyPlayerRegistered
                ? "You are registered in this session."
                : "You are not registered in this session."}
      </p>

      {isMyPlayerRegistered && myPlayerId && (
        <button
          type="button"
          disabled={savingBreakId === myPlayerId}
          onClick={() => void onToggleBreak(myPlayerId, !isMyPlayerOnBreak)}
          className={
            isMyPlayerOnBreak
              ? "mt-4 w-full rounded-xl bg-emerald-500 px-4 py-3 text-xs font-black uppercase tracking-wider text-white transition hover:bg-emerald-400 disabled:opacity-50"
              : "mt-4 w-full rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-xs font-black uppercase tracking-wider text-amber-700 transition hover:bg-amber-100 disabled:opacity-50"
          }
        >
          {isMyPlayerOnBreak
            ? "I'm back, put me in the queue"
            : isMyPlayerOnCourt
              ? "Take a break after this game"
              : "☕ Take a break"}
        </button>
      )}

      {isMyPlayerRegistered && (
        <button
          type="button"
          onClick={() =>
            alertsEnabled ? disableAlerts() : void enableAlerts()
          }
          className={
            alertsEnabled
              ? "mt-4 w-full rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-xs font-black uppercase tracking-wider text-emerald-700 transition hover:bg-emerald-100"
              : "mt-4 w-full rounded-xl bg-cyan-600 px-4 py-3 text-xs font-black uppercase tracking-wider text-white transition hover:bg-cyan-500"
          }
        >
          {alertsEnabled
            ? "🔔 Alerts on · tap to turn off"
            : "🔔 Alert me when I'm up"}
        </button>
      )}

      {myPlayerId && (
        <button
          type="button"
          onClick={() => onShowStats()}
          className="mt-3 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-xs font-black uppercase tracking-wider text-slate-700 transition hover:bg-slate-100"
        >
          📊 My Stats
        </button>
      )}
    </section>
  );
}
