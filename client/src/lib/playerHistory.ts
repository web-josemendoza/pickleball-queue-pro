import type {
  CourtState,
  OpenPlayState,
} from "./game";

export interface PartnerSummary {
  playerId: string;
  name: string;
  games: number;
  wins: number;
}

export interface GameSummary {
  sessionId: string;
  completedAt: number;
  won: boolean;
  myScore: number;
  theirScore: number;
  partnerName: string;
  opponentNames: string[];
}

export interface PlayerHistory {
  playerId: string;
  name: string;
  sessions: number;
  games: number;
  wins: number;
  losses: number;
  winRate: number;
  pointsFor: number;
  pointsAgainst: number;
  topPartners: PartnerSummary[];
  recentGames: GameSummary[];
}

/*
 * Every completed game in a session, once each.
 *
 * Each game lives in cycles[].courts[]; the live
 * `courts` array only mirrors the latest ones, so
 * it is not counted separately.
 */
function completedGames(
  session: OpenPlayState
): CourtState[] {
  return (session.cycles ?? []).flatMap(
    (cycle) =>
      (cycle.courts ?? []).filter(
        (court) =>
          court.status === "completed" &&
          (court.players ?? []).length === 4 &&
          court.scoreA !== null &&
          court.scoreB !== null
      )
  );
}

/*
 * Lifetime stats for one player across the given
 * sessions (archived sessions, plus the live one
 * if the caller includes it).
 */
export function getPlayerHistory(
  playerId: string,
  sessions: OpenPlayState[]
): PlayerHistory {
  let name = "";
  let sessionCount = 0;
  let wins = 0;
  let losses = 0;
  let pointsFor = 0;
  let pointsAgainst = 0;

  const partners = new Map<
    string,
    PartnerSummary
  >();

  const games: GameSummary[] = [];

  for (const session of sessions) {
    let playedInSession = false;

    for (const court of completedGames(session)) {
      const index = court.players.findIndex(
        (player) => player.id === playerId
      );

      if (index === -1) {
        continue;
      }

      playedInSession = true;
      name = court.players[index].name;

      const onTeamA = index < 2;
      const myTeam = onTeamA
        ? court.players.slice(0, 2)
        : court.players.slice(2, 4);
      const theirTeam = onTeamA
        ? court.players.slice(2, 4)
        : court.players.slice(0, 2);

      const myScore = onTeamA
        ? court.scoreA!
        : court.scoreB!;
      const theirScore = onTeamA
        ? court.scoreB!
        : court.scoreA!;

      const won = myScore > theirScore;

      if (won) {
        wins += 1;
      } else {
        losses += 1;
      }

      pointsFor += myScore;
      pointsAgainst += theirScore;

      const partner = myTeam.find(
        (player) => player.id !== playerId
      );

      if (partner) {
        const summary =
          partners.get(partner.id) ?? {
            playerId: partner.id,
            name: partner.name,
            games: 0,
            wins: 0,
          };

        summary.games += 1;
        summary.wins += won ? 1 : 0;
        summary.name = partner.name;
        partners.set(partner.id, summary);
      }

      games.push({
        sessionId: session.sessionId,
        completedAt:
          court.completedAt ?? court.startedAt ?? 0,
        won,
        myScore,
        theirScore,
        partnerName: partner?.name ?? "",
        opponentNames: theirTeam.map(
          (player) => player.name
        ),
      });
    }

    if (playedInSession) {
      sessionCount += 1;
    }
  }

  const totalGames = wins + losses;

  return {
    playerId,
    name,
    sessions: sessionCount,
    games: totalGames,
    wins,
    losses,
    winRate:
      totalGames > 0 ? wins / totalGames : 0,
    pointsFor,
    pointsAgainst,
    topPartners: [...partners.values()]
      .sort(
        (a, b) =>
          b.games - a.games || b.wins - a.wins
      )
      .slice(0, 3),
    recentGames: games
      .sort(
        (a, b) => b.completedAt - a.completedAt
      )
      .slice(0, 10),
  };
}
