import type { PlayerStats } from "../lib/game";

type LiveRankingProps = {
  rankedPlayers: PlayerStats[];
};

export default function LiveRanking({ rankedPlayers }: LiveRankingProps) {
  return (
    <section className="rounded-2xl bg-slate-950 p-5 text-white shadow-xl">
      <p className="text-xs font-black uppercase tracking-widest text-emerald-400">
        Live Ranking
      </p>

      <h2 className="text-xl font-black">Wins</h2>

      <div className="mt-4 space-y-2">
        {rankedPlayers.length === 0 ? (
          <p className="rounded-xl bg-slate-900 p-4 text-sm text-slate-500">
            Complete a court to start ranking players.
          </p>
        ) : (
          rankedPlayers.slice(0, 10).map((player, index) => (
            <div
              key={player.playerId}
              className="flex items-center justify-between rounded-xl bg-slate-900 px-3 py-3"
            >
              <div className="flex min-w-0 items-center gap-3">
                <span className="w-5 text-sm font-black text-cyan-400">
                  {index + 1}
                </span>

                <span className="truncate font-bold">{player.name}</span>
              </div>

              <span className="font-black">{player.wins}W</span>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
