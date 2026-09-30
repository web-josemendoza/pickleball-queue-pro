import {
  poolStandings,
  type Tournament,
} from "../../lib/tournament";
import { poolName, teamName } from "../../lib/tournamentView";

type PoolStandingsProps = {
  tournament: Tournament;
  highlightTeamId: string | null;
};

// One table per pool; the teams that advance are marked.
export default function PoolStandings({
  tournament,
  highlightTeamId,
}: PoolStandingsProps) {
  const advance = tournament.settings.advancePerPool;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {tournament.pools.map((_, pool) => {
        const rows = poolStandings(tournament, pool);

        return (
          <div
            key={pool}
            className="overflow-hidden rounded-2xl bg-white shadow ring-1 ring-slate-200"
          >
            <p className="bg-slate-950 px-4 py-2 text-sm font-black uppercase tracking-widest text-white">
              {poolName(pool)}
            </p>

            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[10px] font-black uppercase tracking-wider text-slate-500">
                  <th className="px-3 py-2">#</th>
                  <th className="px-3 py-2">Team</th>
                  <th className="px-2 py-2 text-center">W–L</th>
                  <th className="px-3 py-2 text-right">+/-</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr
                    key={row.teamId}
                    className={`border-t border-slate-100 ${
                      row.teamId === highlightTeamId ? "bg-emerald-50" : ""
                    }`}
                  >
                    <td className="px-3 py-2 font-black text-slate-400">
                      {index + 1}
                      {index < advance && (
                        <span className="ml-1 text-emerald-500" title="Advances to the playoff">
                          ●
                        </span>
                      )}
                    </td>
                    <td className="max-w-0 truncate px-3 py-2 font-bold">
                      {teamName(tournament, row.teamId)}
                    </td>
                    <td className="px-2 py-2 text-center font-bold tabular-nums">
                      {row.wins}–{row.losses}
                    </td>
                    <td
                      className={`px-3 py-2 text-right font-black tabular-nums ${
                        row.diff > 0
                          ? "text-emerald-600"
                          : row.diff < 0
                            ? "text-red-500"
                            : "text-slate-400"
                      }`}
                    >
                      {row.diff > 0 ? `+${row.diff}` : row.diff}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}
