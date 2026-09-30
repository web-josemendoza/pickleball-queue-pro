import type { PlayerStats } from "./game";

/*
 * Ranking used everywhere: most wins, then win rate, then
 * point differential, then games played.
 */
export function rankPlayerStats(
  players: PlayerStats[]
): PlayerStats[] {

  return [...players].sort(
    (a, b) => {

      /*
       * 1. MOST WINS
       */
      if (
        b.wins !==
        a.wins
      ) {

        return (
          b.wins -
          a.wins
        );

      }

      /*
       * 2. WIN %
       */
      const winRateA =
        a.gamesPlayed > 0
          ? a.wins /
            a.gamesPlayed
          : 0;

      const winRateB =
        b.gamesPlayed > 0
          ? b.wins /
            b.gamesPlayed
          : 0;

      if (
        winRateB !==
        winRateA
      ) {

        return (
          winRateB -
          winRateA
        );

      }

      /*
       * 3. POINT DIFFERENTIAL
       */
      const diffA =
        a.pointsFor -
        a.pointsAgainst;

      const diffB =
        b.pointsFor -
        b.pointsAgainst;

      if (
        diffB !==
        diffA
      ) {

        return (
          diffB -
          diffA
        );

      }

      /*
       * 4. GAMES PLAYED
       */
      return (
        b.gamesPlayed -
        a.gamesPlayed
      );
    }
  );
}
