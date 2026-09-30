/*
 * Tournament logic: pools, schedule, standings, playoff
 * bracket and the court queue. Pure (no Firebase), so the
 * rules can be tested directly. Firebase storage lives in
 * tournamentStore.ts.
 *
 * Format: round-robin pools, then a single-elimination
 * playoff. Courts take the next ready match as soon as
 * they free up.
 */

export type TournamentStatus =
  | "setup"
  | "pools"
  | "playoffs"
  | "finished";

export interface TeamMember {
  name: string;
  // Registered players have an id; guests only a name.
  playerId?: string;
}

export interface TournamentTeam {
  id: string;
  name: string;
  members: TeamMember[];
  // 1 = strongest. Decides pools and playoff order ties.
  seed: number;
}

export interface TournamentSettings {
  courtCount: number;
  // Target teams per pool; pools end up within one of it.
  poolSize: number;
  // Teams from each pool that reach the playoff.
  advancePerPool: number;
  poolPoints: number;
  playoffPoints: number;
}

export type MatchStatus = "waiting" | "playing" | "done";

export interface TournamentMatch {
  id: string;
  stage: "pool" | "playoff";
  // Pool matches: which pool and round-robin round.
  pool?: number;
  // Playoff matches: 1 = first round; last round = final.
  round?: number;
  slot?: number;
  teamA: string | null;
  teamB: string | null;
  // Position in the schedule (lower = earlier).
  order: number;
  status: MatchStatus;
  court: number | null;
  startedAt: number | null;
  completedAt: number | null;
  scoreA: number | null;
  scoreB: number | null;
  winner: string | null;
  // Playoff match decided without playing (a bye).
  bye?: boolean;
}

export interface Tournament {
  id: string;
  name: string;
  status: TournamentStatus;
  settings: TournamentSettings;
  teams: Record<string, TournamentTeam>;
  // Team ids per pool.
  pools: string[][];
  matches: Record<string, TournamentMatch>;
  championId: string | null;
  createdAt: number;
}

export const DEFAULT_SETTINGS: TournamentSettings = {
  courtCount: 4,
  poolSize: 4,
  advancePerPool: 2,
  poolPoints: 11,
  playoffPoints: 15,
};

// ------------------------------------------------------
// HELPERS
// ------------------------------------------------------

export function teamsBySeed(t: Tournament): TournamentTeam[] {
  return Object.values(t.teams ?? {}).sort(
    (a, b) => a.seed - b.seed
  );
}

export function matchList(t: Tournament): TournamentMatch[] {
  return Object.values(t.matches ?? {}).sort(
    (a, b) => a.order - b.order
  );
}

function emptyMatch(
  fields: Pick<TournamentMatch, "id" | "stage" | "order"> &
    Partial<TournamentMatch>
): TournamentMatch {
  return {
    teamA: null,
    teamB: null,
    status: "waiting",
    court: null,
    startedAt: null,
    completedAt: null,
    scoreA: null,
    scoreB: null,
    winner: null,
    ...fields,
  };
}

// ------------------------------------------------------
// POOLS AND ROUND ROBIN
// ------------------------------------------------------

/*
 * Splits seeded teams into pools "snake" style so the
 * strongest teams are spread out: with 4 pools,
 * A gets seeds 1, 8, 9, 16; B gets 2, 7, 10, 15; ...
 */
export function makePools(
  seededTeamIds: string[],
  poolSize: number
): string[][] {
  const count = Math.max(
    1,
    Math.round(seededTeamIds.length / Math.max(2, poolSize))
  );

  const pools: string[][] = Array.from(
    { length: count },
    () => []
  );

  seededTeamIds.forEach((id, index) => {
    const lap = Math.floor(index / count);
    const position = index % count;
    const pool = lap % 2 === 0 ? position : count - 1 - position;
    pools[pool].push(id);
  });

  return pools;
}

/*
 * Every team plays every other team once (circle method).
 * Returns pairings grouped by round; with an odd number of
 * teams one team rests each round.
 */
export function roundRobinRounds(
  teamIds: string[]
): [string, string][][] {
  const slots: (string | null)[] = [...teamIds];

  if (slots.length % 2 === 1) {
    slots.push(null);
  }

  const n = slots.length;
  const rounds: [string, string][][] = [];

  for (let round = 0; round < n - 1; round++) {
    const pairs: [string, string][] = [];

    for (let i = 0; i < n / 2; i++) {
      const a = slots[i];
      const b = slots[n - 1 - i];

      if (a && b) {
        pairs.push([a, b]);
      }
    }

    rounds.push(pairs);

    // Keep the first slot fixed, rotate the rest.
    slots.splice(1, 0, slots.pop()!);
  }

  return rounds;
}

/*
 * All pool matches, ordered round by round across pools so
 * every pool progresses together.
 */
export function makePoolMatches(
  pools: string[][]
): TournamentMatch[] {
  const perPool = pools.map(roundRobinRounds);
  const maxRounds = Math.max(0, ...perPool.map((r) => r.length));
  const matches: TournamentMatch[] = [];

  for (let round = 0; round < maxRounds; round++) {
    perPool.forEach((rounds, pool) => {
      (rounds[round] ?? []).forEach(([teamA, teamB], index) => {
        matches.push(
          emptyMatch({
            id: `pool${pool + 1}-r${round + 1}-m${index + 1}`,
            stage: "pool",
            pool,
            order: matches.length,
            teamA,
            teamB,
          })
        );
      });
    });
  }

  return matches;
}

// ------------------------------------------------------
// STANDINGS
// ------------------------------------------------------

export interface StandingRow {
  teamId: string;
  played: number;
  wins: number;
  losses: number;
  pointsFor: number;
  pointsAgainst: number;
  diff: number;
}

function winPct(row: StandingRow): number {
  return row.played === 0 ? 0 : row.wins / row.played;
}

/*
 * Pool table. Ranked by win rate, then head-to-head (for a
 * two-way tie), then point differential, points scored,
 * and finally seed.
 */
export function poolStandings(
  t: Tournament,
  pool: number
): StandingRow[] {
  const ids = t.pools[pool] ?? [];
  const rows = new Map<string, StandingRow>(
    ids.map((teamId) => [
      teamId,
      {
        teamId,
        played: 0,
        wins: 0,
        losses: 0,
        pointsFor: 0,
        pointsAgainst: 0,
        diff: 0,
      },
    ])
  );

  const done = matchList(t).filter(
    (m) =>
      m.stage === "pool" &&
      m.pool === pool &&
      m.status === "done" &&
      m.teamA &&
      m.teamB &&
      m.scoreA !== null &&
      m.scoreB !== null
  );

  for (const m of done) {
    const a = rows.get(m.teamA!);
    const b = rows.get(m.teamB!);

    if (!a || !b) {
      continue;
    }

    a.played += 1;
    b.played += 1;
    a.pointsFor += m.scoreA!;
    a.pointsAgainst += m.scoreB!;
    b.pointsFor += m.scoreB!;
    b.pointsAgainst += m.scoreA!;

    if (m.winner === m.teamA) {
      a.wins += 1;
      b.losses += 1;
    } else {
      b.wins += 1;
      a.losses += 1;
    }
  }

  for (const row of rows.values()) {
    row.diff = row.pointsFor - row.pointsAgainst;
  }

  const seed = (id: string) => t.teams[id]?.seed ?? 999;

  const headToHead = (x: string, y: string): number => {
    const match = done.find(
      (m) =>
        (m.teamA === x && m.teamB === y) ||
        (m.teamA === y && m.teamB === x)
    );

    if (!match) {
      return 0;
    }

    return match.winner === x ? -1 : 1;
  };

  const byWinPct = [...rows.values()].sort(
    (a, b) => winPct(b) - winPct(a)
  );

  // Break ties within each group of equal win rate.
  const ranked: StandingRow[] = [];
  let i = 0;

  while (i < byWinPct.length) {
    let j = i + 1;

    while (
      j < byWinPct.length &&
      winPct(byWinPct[j]) === winPct(byWinPct[i])
    ) {
      j++;
    }

    const group = byWinPct.slice(i, j);

    group.sort((a, b) => {
      if (group.length === 2) {
        const h2h = headToHead(a.teamId, b.teamId);

        if (h2h !== 0) {
          return h2h;
        }
      }

      return (
        b.diff - a.diff ||
        b.pointsFor - a.pointsFor ||
        seed(a.teamId) - seed(b.teamId)
      );
    });

    ranked.push(...group);
    i = j;
  }

  return ranked;
}

// ------------------------------------------------------
// PLAYOFF BRACKET
// ------------------------------------------------------

/*
 * Order of seeds down a bracket so 1 and 2 can only meet
 * in the final: for 8 slots, 1v8, 4v5, 2v7, 3v6.
 */
export function bracketOrder(size: number): number[] {
  let order = [1];

  while (order.length < size) {
    const n = order.length * 2;
    order = order.flatMap((seed) => [seed, n + 1 - seed]);
  }

  return order;
}

/*
 * Playoff seeds: every pool winner first (best record
 * first), then every runner-up, and so on.
 */
export function playoffQualifiers(t: Tournament): string[] {
  const tables = t.pools.map((_, pool) => poolStandings(t, pool));
  const qualifiers: string[] = [];

  for (let place = 0; place < t.settings.advancePerPool; place++) {
    const atPlace = tables
      .map((table) => table[place])
      .filter((row): row is StandingRow => !!row)
      .sort(
        (a, b) =>
          winPct(b) - winPct(a) ||
          b.diff - a.diff ||
          b.pointsFor - a.pointsFor ||
          (t.teams[a.teamId]?.seed ?? 999) -
            (t.teams[b.teamId]?.seed ?? 999)
      );

    qualifiers.push(...atPlace.map((row) => row.teamId));
  }

  return qualifiers;
}

export function playoffRoundCount(qualifiers: number): number {
  return Math.max(0, Math.ceil(Math.log2(Math.max(1, qualifiers))));
}

export function playoffMatchId(round: number, slot: number) {
  return `playoff-r${round}-m${slot + 1}`;
}

/*
 * Builds the bracket. Top seeds get byes when the number of
 * qualifiers isn't a power of two; byes are decided
 * straight away and never take a court.
 */
export function makePlayoffMatches(
  qualifiers: string[],
  startOrder: number
): TournamentMatch[] {
  const rounds = playoffRoundCount(qualifiers.length);

  if (rounds === 0) {
    return [];
  }

  const size = 2 ** rounds;
  const seeds = bracketOrder(size);
  const matches: TournamentMatch[] = [];
  let order = startOrder;

  for (let round = 1; round <= rounds; round++) {
    const count = size / 2 ** round;

    for (let slot = 0; slot < count; slot++) {
      const match = emptyMatch({
        id: playoffMatchId(round, slot),
        stage: "playoff",
        round,
        slot,
        order: order++,
      });

      if (round === 1) {
        match.teamA = qualifiers[seeds[slot * 2] - 1] ?? null;
        match.teamB = qualifiers[seeds[slot * 2 + 1] - 1] ?? null;
      }

      matches.push(match);
    }
  }

  return matches;
}

// Moves a playoff winner into the next round's match.
function advanceWinner(
  matches: Record<string, TournamentMatch>,
  match: TournamentMatch
) {
  if (match.stage !== "playoff" || !match.winner) {
    return;
  }

  const next = matches[
    playoffMatchId(match.round! + 1, Math.floor(match.slot! / 2))
  ];

  if (!next) {
    return;
  }

  if (match.slot! % 2 === 0) {
    next.teamA = match.winner;
  } else {
    next.teamB = match.winner;
  }
}

// Decides first-round byes (a team with no opponent).
function resolveByes(
  matches: Record<string, TournamentMatch>,
  now: number
) {
  for (const match of Object.values(matches)) {
    if (
      match.stage === "playoff" &&
      match.round === 1 &&
      match.status === "waiting" &&
      (match.teamA === null) !== (match.teamB === null)
    ) {
      match.status = "done";
      match.bye = true;
      match.winner = match.teamA ?? match.teamB;
      match.completedAt = now;
      advanceWinner(matches, match);
    }
  }
}

// ------------------------------------------------------
// COURT QUEUE
// ------------------------------------------------------

export function busyTeamIds(t: Tournament): Set<string> {
  const busy = new Set<string>();

  for (const m of matchList(t)) {
    if (m.status === "playing") {
      if (m.teamA) busy.add(m.teamA);
      if (m.teamB) busy.add(m.teamB);
    }
  }

  return busy;
}

function lastFinished(t: Tournament, teamId: string): number {
  let latest = -Infinity;

  for (const m of matchList(t)) {
    if (
      m.status === "done" &&
      !m.bye &&
      (m.teamA === teamId || m.teamB === teamId) &&
      m.completedAt !== null
    ) {
      latest = Math.max(latest, m.completedAt);
    }
  }

  return latest;
}

/*
 * Matches that can go on court now, best first: both teams
 * known and free, the better-rested pair first (so nobody
 * plays back to back while others wait), then schedule
 * order.
 */
export function readyMatches(t: Tournament): TournamentMatch[] {
  const busy = busyTeamIds(t);

  const candidates = matchList(t).filter(
    (m) =>
      m.status === "waiting" &&
      m.teamA &&
      m.teamB &&
      !busy.has(m.teamA) &&
      !busy.has(m.teamB)
  );

  // Most recent finish of either team: earlier = more rested.
  const restedSince = (m: TournamentMatch) =>
    Math.max(lastFinished(t, m.teamA!), lastFinished(t, m.teamB!));

  return candidates.sort(
    (a, b) => restedSince(a) - restedSince(b) || a.order - b.order
  );
}

/*
 * Matches waiting for a court, in the order they will be
 * called if courts free up now (for the "Up next" list).
 */
export function upNextMatches(
  t: Tournament,
  limit: number
): TournamentMatch[] {
  const picked: TournamentMatch[] = [];
  const busy = busyTeamIds(t);

  for (const match of readyMatches(t)) {
    if (picked.length >= limit) break;
    if (busy.has(match.teamA!) || busy.has(match.teamB!)) continue;
    picked.push(match);
    busy.add(match.teamA!);
    busy.add(match.teamB!);
  }

  return picked;
}

// Puts the next ready matches on every free court.
export function fillCourts(t: Tournament, now: number): Tournament {
  const next = structuredClone(t);
  const used = new Set(
    matchList(next)
      .filter((m) => m.status === "playing")
      .map((m) => m.court)
  );

  for (let court = 1; court <= next.settings.courtCount; court++) {
    if (used.has(court)) {
      continue;
    }

    const [match] = readyMatches(next);

    if (!match) {
      break;
    }

    const target = next.matches[match.id];
    target.status = "playing";
    target.court = court;
    target.startedAt = now;
    used.add(court);
  }

  return next;
}

// ------------------------------------------------------
// STARTING AND PROGRESSING
// ------------------------------------------------------

export function startTournament(
  t: Tournament,
  now: number
): Tournament {
  const teams = teamsBySeed(t);

  if (teams.length < 2) {
    throw new Error("Add at least 2 teams.");
  }

  const pools = makePools(
    teams.map((team) => team.id),
    t.settings.poolSize
  );

  const matches = Object.fromEntries(
    makePoolMatches(pools).map((m) => [m.id, m])
  );

  return fillCourts(
    {
      ...t,
      status: "pools",
      pools,
      matches,
      championId: null,
    },
    now
  );
}

// Once every pool match is done, build the playoff.
function maybeStartPlayoffs(t: Tournament, now: number): Tournament {
  if (t.status !== "pools") {
    return t;
  }

  const pending = matchList(t).some(
    (m) => m.stage === "pool" && m.status !== "done"
  );

  if (pending) {
    return t;
  }

  const qualifiers = playoffQualifiers(t);

  if (qualifiers.length < 2) {
    return {
      ...t,
      status: "finished",
      championId: qualifiers[0] ?? null,
    };
  }

  const matches = { ...t.matches };

  for (const m of makePlayoffMatches(
    qualifiers,
    matchList(t).length
  )) {
    matches[m.id] = m;
  }

  resolveByes(matches, now);

  return { ...t, status: "playoffs", matches };
}

function finalMatch(t: Tournament): TournamentMatch | undefined {
  return matchList(t)
    .filter((m) => m.stage === "playoff")
    .sort((a, b) => b.round! - a.round!)[0];
}

function validateScore(scoreA: number, scoreB: number) {
  if (
    !Number.isInteger(scoreA) ||
    !Number.isInteger(scoreB) ||
    scoreA < 0 ||
    scoreB < 0
  ) {
    throw new Error("Scores must be whole numbers, 0 or more.");
  }

  if (scoreA === scoreB) {
    throw new Error("A match cannot end in a tie.");
  }
}

/*
 * Records a finished match, then fills the free court and
 * moves the tournament on (playoffs, next round, champion).
 */
export function recordResult(
  t: Tournament,
  matchId: string,
  scoreA: number,
  scoreB: number,
  now: number
): Tournament {
  validateScore(scoreA, scoreB);

  const match = t.matches[matchId];

  if (!match) {
    throw new Error("That match could not be found.");
  }

  if (match.status !== "playing") {
    throw new Error("That match is not being played right now.");
  }

  let next = structuredClone(t);
  const m = next.matches[matchId];

  m.status = "done";
  m.scoreA = scoreA;
  m.scoreB = scoreB;
  m.winner = scoreA > scoreB ? m.teamA : m.teamB;
  m.completedAt = now;

  advanceWinner(next.matches, m);
  next = maybeStartPlayoffs(next, now);

  if (next.status === "playoffs" && finalMatch(next)?.status === "done") {
    next.status = "finished";
    next.championId = finalMatch(next)!.winner;
  }

  return next.status === "finished" ? next : fillCourts(next, now);
}

/*
 * Admin fix of a finished match's score. Pool matches can
 * be fixed until the playoff starts; a playoff match only
 * while the winner's next match hasn't started.
 */
export function correctResult(
  t: Tournament,
  matchId: string,
  scoreA: number,
  scoreB: number
): Tournament {
  validateScore(scoreA, scoreB);

  const match = t.matches[matchId];

  if (!match || match.status !== "done" || match.bye) {
    throw new Error("Only finished matches can be corrected.");
  }

  if (match.stage === "pool" && t.status !== "pools") {
    throw new Error(
      "Pool results are locked once the playoff has started."
    );
  }

  const next = structuredClone(t);
  const m = next.matches[matchId];
  const newWinner = scoreA > scoreB ? m.teamA : m.teamB;

  if (m.stage === "playoff" && newWinner !== m.winner) {
    const following =
      next.matches[
        playoffMatchId(m.round! + 1, Math.floor(m.slot! / 2))
      ];

    if (following && following.status !== "waiting") {
      throw new Error(
        "The next playoff match has already started, so the winner can't change."
      );
    }
  }

  m.scoreA = scoreA;
  m.scoreB = scoreB;
  m.winner = newWinner;
  advanceWinner(next.matches, m);

  if (next.status === "finished" && m.id === finalMatch(next)?.id) {
    next.championId = newWinner;
  }

  return next;
}
