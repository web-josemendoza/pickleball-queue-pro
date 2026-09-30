import PlayerAuth from "./components/PlayerAuth";
import CompletedGames, {
  type CompletedGame,
} from "./components/CompletedGames";
import CourtCard from "./components/CourtCard";
import LiveRanking from "./components/LiveRanking";
import PlayerStatusCard from "./components/PlayerStatusCard";
import PlayerQueuePanel from "./components/PlayerQueuePanel";
import ConfigureOpenPlay from "./components/ConfigureOpenPlay";
import FinalResults from "./components/FinalResults";
import JoinQueueCard from "./components/JoinQueueCard";
import {
  formatTime,
} from "./lib/format";
import { usePlayerAlerts } from "./hooks/usePlayerAlerts";

import { logout, subscribeToAuth } from "./lib/auth";

import {
  getPlayerProfile,
  type PlayerProfile,
} from "./lib/player";

import {
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import "./App.css";

import {
  joinQueue,
  leaveQueue,
  replaceQueuePlayers,
  subscribeToQueue,
  type QueuePlayer,
} from "./lib/queue";


import {
  archiveOpenPlaySession,
  clearOpenPlay,
  correctGameScore,
  finishCourtGame,
  finishOpenPlay,
  getRankedPlayers,
  saveCourtDraftScore,
  setPlayerBreak,
  startNextCycle,
  subscribeToOpenPlay,
  subscribeToSessionHistory,
  type ArchivedOpenPlaySession,
  type CourtState,
  type OpenPlayState,
  type PlayerStats,
} from "./lib/game";

import {
  isSessionFinished,
  type OpenPlaySession,
} from "./lib/session";

// Windows that open rarely load on first use.
const PlayerStatsModal = lazy(() => import("./components/PlayerStatsModal"));
const EditScoreModal = lazy(() => import("./components/EditScoreModal"));
const JoinQrModal = lazy(() => import("./components/JoinQrModal"));
const SessionHistoryModal = lazy(() => import("./components/SessionHistoryModal"));
const ManagePlayersModal = lazy(() => import("./components/ManagePlayersModal"));
const CourtEditorModal = lazy(() => import("./components/CourtEditorModal"));

type ScoreInput = {
  a: string;
  b: string;
};

type ScoreInputs = Record<number, ScoreInput>;




function formatRemaining(milliseconds: number) {



  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${String(minutes).padStart(2, "0")}m`;
  }

  return `${String(minutes).padStart(2, "0")}m ${String(seconds).padStart(2, "0")}s`;
}





function App() {

const [
  editingCourtNumber,
  setEditingCourtNumber,
] = useState<number | null>(null);

const [
  archivedSessions,
  setArchivedSessions,
] = useState<ArchivedOpenPlaySession[]>([]);

const [
  showSessionHistory,
  setShowSessionHistory,
] = useState(false);



const [
  showManagePlayers,
  setShowManagePlayers,
] = useState(false);

    

  const [showAuth, setShowAuth] =
  useState(false);

  const [authReady, setAuthReady] =
  useState(false);

const [playerProfile, setPlayerProfile] =
  useState<PlayerProfile | null>(null);

  const [players, setPlayers] = useState<QueuePlayer[]>([]);
  const [game, setGame] = useState<OpenPlayState | null>(null);

  const [myPlayerId, setMyPlayerId] = useState<string | null>(
    localStorage.getItem("pickleballPlayerId")
  );

  // myPlayerId starts from localStorage, so wait
  // for Firebase Auth to confirm the sign-in.
  const isSignedIn =
    authReady && myPlayerId !== null;
  const [loading, setLoading] = useState(false);



  const [showJoinQr, setShowJoinQr] = useState(false);

  const [editingResult, setEditingResult] =
    useState<CompletedGame | null>(null);
  const [scores, setScores] = useState<ScoreInputs>({});
  const [finishingCourt, setFinishingCourt] = useState<number | null>(null);
  const [clearingSession, setClearingSession] = useState(false);


  const [now, setNow] = useState(Date.now());









const [
  statsPlayerId,
  setStatsPlayerId,
] = useState<string | null>(null);

const onBreakIds = useMemo(
  () => new Set(game?.onBreakIds ?? []),
  [game]
);

// Waiting players who can actually be called
// to a court (not on break), in queue order.
const readyWaitingPlayers = useMemo(() => {
  if (!game || game.status !== "active") {
    return [];
  }

  return (game.waitingPlayers ?? []).filter(
    (player) => !onBreakIds.has(player.id)
  );
}, [game, onBreakIds]);

const isMyPlayerOnBreak =
  myPlayerId !== null &&
  onBreakIds.has(myPlayerId);

  const myWaitingPosition = useMemo(() => {
  if (
    !game ||
    game.status !== "active" ||
    !myPlayerId
  ) {
    return null;
  }

  const index =
    readyWaitingPlayers.findIndex(
    (player) =>
      player.id === myPlayerId
  );

  return index >= 0
    ? index + 1
    : null;
}, [game, myPlayerId, readyWaitingPlayers]);

const myCourtNumber = useMemo(() => {
  if (
    !game ||
    game.status !== "active" ||
    !myPlayerId
  ) {
    return null;
  }

  const court = game.courts.find(
    (court) =>
      court.players.some(
        (player) =>
          player.id === myPlayerId
      )
  );

  return court?.courtNumber ?? null;
}, [game, myPlayerId]);
  // Prevent two browser effects from starting the same next cycle.
  const advancingCycleRef = useRef(false);
  const endingSessionRef = useRef(false);

  // --------------------------------------------------
  // REAL-TIME QUEUE
  // --------------------------------------------------
useEffect(() => {
  const unsubscribe =
    subscribeToAuth(async (user) => {
      setAuthReady(true);

      if (!user) {
        setMyPlayerId(null);
        setPlayerProfile(null);

        localStorage.removeItem(
          "pickleballPlayerId"
        );

        return;
      }

      setMyPlayerId(user.uid);

      localStorage.setItem(
        "pickleballPlayerId",
        user.uid
      );

      try {
        const profile =
          await getPlayerProfile(user.uid);

        setPlayerProfile(profile);
      } catch (error) {
        console.error(
          "Unable to load player profile:",
          error
        );

        setPlayerProfile(null);
      }
    });

  return unsubscribe;
}, []);

  useEffect(() => {
    const unsubscribe = subscribeToQueue((updatedPlayers) => {
      setPlayers(updatedPlayers);
    });

    return unsubscribe;
  }, []);

  // --------------------------------------------------
  // REAL-TIME OPEN PLAY
  // --------------------------------------------------

  useEffect(() => {
    const unsubscribe = subscribeToOpenPlay((state) => {
      setGame(state);
    });

    return unsubscribe;
  }, []);


  useEffect(() => {
  const unsubscribe =
    subscribeToSessionHistory(
      (sessions) => {
        setArchivedSessions(
          sessions
        );
      }
    );

  return unsubscribe;
}, []);

  // --------------------------------------------------
  // CLOCK
  // --------------------------------------------------

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => window.clearInterval(timer);
  }, []);

  // --------------------------------------------------
  // AUTO-FINISH SESSION WHEN TIME EXPIRES
  // --------------------------------------------------

  useEffect(() => {
    if (!game || game.status !== "active" || !game.endsAt) {
      endingSessionRef.current = false;
      return;
    }

    // Only signed-in devices may write the session.
    if (!isSignedIn) {
      return;
    }

    const sessionForClock: OpenPlaySession = {
      playerCount: game.playerCount,
      courtCount: game.courtCount,
      durationHours: game.durationHours,
      rotationMode: "4_ON_4_OFF",
      startedAt: game.startedAt,
      endsAt: game.endsAt,
      status: "active",
    };

    if (isSessionFinished(sessionForClock, now) && !endingSessionRef.current) {
      endingSessionRef.current = true;

      void finishOpenPlay().catch((error) => {
        console.error("Unable to finish open play:", error);
        endingSessionRef.current = false;
      });
    }
  }, [game, now, isSignedIn]);

  // --------------------------------------------------
  // RESET SCORE INPUTS WHEN A NEW CYCLE STARTS
  // --------------------------------------------------

  useEffect(() => {
    if (!game) return;

    const restoredScores: ScoreInputs = {};

    game.courts.forEach((court) => {
      if (court.status !== "playing") return;

      restoredScores[court.courtNumber] = {
        a: court.draftScoreA ?? "",
        b: court.draftScoreB ?? "",
      };
    });

    setScores(restoredScores);
    setFinishingCourt(null);
  }, [game?.cycleNumber]);

  // --------------------------------------------------
// AUTOMATICALLY START NEXT CYCLE
// --------------------------------------------------

useEffect(() => {
  // The database only accepts session writes
  // from signed-in users, so spectators leave
  // this to a signed-in device.
  if (!isSignedIn) {
    return;
  }

  if (!game || game.status !== "active") {
    return;
  }

  // Independent court rotation:
  // as soon as ANY court finishes, rotate that court.
  const hasCompletedCourt =
    game.courts.some(
      (court) =>
        court.status === "completed"
    );

  if (!hasCompletedCourt) {
    return;
  }

  if (advancingCycleRef.current) {
    return;
  }

  if (
    game.endsAt &&
    Date.now() >= game.endsAt
  ) {
    void finishOpenPlay().catch(
      (error) => {
        console.error(
          "Unable to finish expired open play:",
          error
        );
      }
    );

    return;
  }

  advancingCycleRef.current = true;

  void startNextCycle()
    .catch((error) => {
      console.error(
        "Unable to start next cycle:",
        error
      );

      alert(
        `Unable to start the next cycle.\n\n${
          error instanceof Error
            ? error.message
            : String(error)
        }`
      );
    })
    .finally(() => {
      window.setTimeout(() => {
        advancingCycleRef.current = false;
      }, 250);
    });
}, [game, isSignedIn]);
  // --------------------------------------------------
  // DERIVED VALUES
  // --------------------------------------------------

  const currentCourtPlayerIds = useMemo(() => {
  if (!game || game.status !== "active") {
    return new Set<string>();
  }

  return new Set(
    game.courts
      .filter((court) => court.status === "playing")
      .flatMap((court) =>
        court.players.map((player) => player.id)
      )
  );
}, [game]);

const onCourtPlayers = useMemo(() => {
  if (!game || game.status !== "active") {
    return [];
  }

  return game.courts
    .filter(
      (court) => court.status === "playing"
    )
    .flatMap((court) => court.players);
}, [game]);

// With independent court rotation, only the next four
// waiting players are truly UP NEXT. Whichever court
// finishes first will draw from this front group.
const upNextCount =
  game?.status === "active"
    ? 4
    : 0;

// Saved sessions plus the live one, each once.
const statsSessions = useMemo(() => {
  const archivedIds = new Set(
    archivedSessions.map(
      (session) => session.sessionId
    )
  );

  return game && !archivedIds.has(game.sessionId)
    ? [...archivedSessions, game]
    : archivedSessions;
}, [archivedSessions, game]);

// Everyone who has appeared in any session, for
// the admin's player picker.
const statsPlayerOptions = useMemo(() => {
  const names = new Map<string, string>();

  for (const session of statsSessions) {
    for (const player of session.players ?? []) {
      names.set(player.id, player.name);
    }
  }

  return [...names.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) =>
      a.name.localeCompare(b.name)
    );
}, [statsSessions]);

const myPlayingCourtNumber =
  game?.status === "active"
    ? game.courts.find(
        (court) =>
          court.status === "playing" &&
          court.players.some(
            (player) =>
              player.id === myPlayerId
          )
      )?.courtNumber ?? null
    : null;

const {
  alertsEnabled,
  enableAlerts,
  disableAlerts,
  pushResult,
  activeAlert,
  dismissAlert,
} = usePlayerAlerts(
  myPlayingCourtNumber,
  myWaitingPosition !== null &&
    myWaitingPosition <= upNextCount,
  myPlayerId
);

const upNextPlayers = useMemo(() => {
  if (!game || game.status !== "active") {
    return [];
  }

  return readyWaitingPlayers.slice(
    0,
    upNextCount
  );
}, [game, upNextCount, readyWaitingPlayers]);

const laterWaitingPlayers = useMemo(() => {
  if (!game || game.status !== "active") {
    return [];
  }

  return readyWaitingPlayers.slice(
    upNextCount
  );
}, [game, upNextCount, readyWaitingPlayers]);

const onBreakPlayers = useMemo(
  () =>
    (game?.waitingPlayers ?? []).filter(
      (player) => onBreakIds.has(player.id)
    ),
  [game, onBreakIds]
);

const waitingPlayers = readyWaitingPlayers;

const waitingPositionById = useMemo(() => {
  const positions = new Map<string, number>();

  waitingPlayers.forEach((player, index) => {
    positions.set(player.id, index + 1);
  });

  return positions;
}, [waitingPlayers]);

const orderedPlayerPool = useMemo(() => {
  if (!game || game.status !== "active") {
    return players;
  }

  return [
    ...onCourtPlayers,
    ...(game.waitingPlayers ?? []),
  ];
}, [
  players,
  game,
  onCourtPlayers,
]);

  const isMyPlayerOnCourt = myPlayerId
    ? currentCourtPlayerIds.has(myPlayerId)
    : false;

  const isMyPlayerRegistered = myPlayerId
    ? game?.status === "active"
      ? game.players.some(
          (player) =>
            player.id === myPlayerId
        )
      : players.some(
          (player) =>
            player.id === myPlayerId
        )
    : false;

  const registeredPlayerCount =
    game?.status === "active"
      ? game.players.length
      : players.length;

  const remainingMs = game?.endsAt
    ? Math.max(0, game.endsAt - now)
    : 0;

  const rankedPlayers: PlayerStats[] = useMemo(() => {
    if (!game) return [];
    return getRankedPlayers(game);
  }, [game]);

  const isAdmin =
  playerProfile?.role === "admin";

  const statsModal = statsPlayerId && (
    <Suspense fallback={null}>
    <PlayerStatsModal
      key={statsPlayerId}
      sessions={statsSessions}
      initialPlayerId={statsPlayerId}
      playerOptions={
        isAdmin ? statsPlayerOptions : undefined
      }
      onClose={() => setStatsPlayerId(null)}
    />
    </Suspense>
  );

  const joinQrModal = showJoinQr && (
    <Suspense fallback={null}>
      <JoinQrModal onClose={() => setShowJoinQr(false)} />
    </Suspense>
  );

  const editScoreModal = isAdmin && editingResult && (
    <Suspense fallback={null}>
    <EditScoreModal
      key={`${editingResult.courtNumber}-${editingResult.startedAt}`}
      game={editingResult}
      onSave={(scoreA, scoreB) =>
        correctGameScore(
          editingResult.courtNumber,
          editingResult.startedAt,
          scoreA,
          scoreB
        )
      }
      onClose={() => setEditingResult(null)}
    />
    </Suspense>
  );

  const recentResults = useMemo(() => {
  if (!game) return [];

  return game.cycles
    .flatMap((cycle) =>
      cycle.courts
        .filter(
          (court) =>
            court.status === "completed" &&
            court.scoreA !== null &&
            court.scoreB !== null
        )
        .map((court) => ({
          cycleNumber: cycle.cycleNumber,
          courtNumber: court.courtNumber,
          players: court.players,
          scoreA: court.scoreA as number,
          scoreB: court.scoreB as number,
          winnerIds: court.winnerIds,
          startedAt: court.startedAt,
          completedAt: court.completedAt,
        }))
    )
    .sort(
      (a, b) =>
        (b.completedAt ?? 0) -
        (a.completedAt ?? 0)
    );
}, [game]);



const sessionStats = useMemo(() => {
  if (recentResults.length === 0) {
    return {
      totalGames: 0,
      totalCycles: 0,
      averageDuration: 0,
      longestDuration: 0,
    };
  }

  const durations = recentResults
    .map((result) => {
      if (
        !result.startedAt ||
        !result.completedAt
      ) {
        return 0;
      }

      return Math.max(
        0,
        result.completedAt - result.startedAt
      );
    })
    .filter((duration) => duration > 0);

  const totalDuration = durations.reduce(
    (total, duration) => total + duration,
    0
  );

  const totalCycles = new Set(
    recentResults.map(
      (result) => result.cycleNumber
    )
  ).size;

  return {
    totalGames: recentResults.length,

    totalCycles,

    averageDuration:
      durations.length > 0
        ? totalDuration / durations.length
        : 0,

    longestDuration:
      durations.length > 0
        ? Math.max(...durations)
        : 0,
  };
}, [recentResults]);

  // --------------------------------------------------
  // JOIN QUEUE
  // --------------------------------------------------

  const handleJoinQueue = async () => {
  if (!authReady) {
    alert(
      "Please wait for authentication to finish loading."
    );
    return;
  }

  if (!myPlayerId) {
    alert(
      "Please sign in or create a player account first."
    );
    return;
  }

  if (!playerProfile) {
    alert(
      "Player profile not found."
    );
    return;
  }

  if (game?.status === "active") {
    alert(
      "Open play has already started. New players cannot be added until the session ends."
    );
    return;
  }

  if (isMyPlayerRegistered) {
    alert(
      "You are already registered."
    );
    return;
  }

  setLoading(true);

  try {
    await joinQueue({
      playerId: myPlayerId,
      name: playerProfile.name,
      skillLevel:
        playerProfile.skillLevel,
    });

    localStorage.setItem(
      "pickleballPlayerId",
      myPlayerId
    );

    localStorage.setItem(
      "pickleballPlayerName",
      playerProfile.name
    );
  } catch (error) {
    console.error(
      "Error joining queue:",
      error
    );

    alert(
      `Unable to join the queue.\n\n${
        error instanceof Error
          ? error.message
          : String(error)
      }`
    );
  } finally {
    setLoading(false);
  }
};

  // --------------------------------------------------
  // LEAVE QUEUE / PLAYER POOL
  // --------------------------------------------------

  const handleLeaveQueue = async () => {
    if (!myPlayerId) {
      alert("You are not currently registered.");
      return;
    }

    if (isMyPlayerOnCourt) {
      alert("You are currently playing. Finish the current game before leaving.");
      return;
    }

    try {
      await leaveQueue(myPlayerId);
      localStorage.removeItem("pickleballPlayerId");
      localStorage.removeItem("pickleballPlayerName");
      setMyPlayerId(null);
    } catch (error) {
      console.error("Error leaving queue:", error);
      alert(
        `Unable to leave.\n\n${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  };

  // --------------------------------------------------
  // START 4-ON / 4-OFF OPEN PLAY
  // --------------------------------------------------


  // --------------------------------------------------
  // FINISH ONE COURT
  // --------------------------------------------------

  const handleFinishCourt = async (court: CourtState) => {
    if (!game || game.status !== "active") return;

    const input = scores[court.courtNumber] ?? { a: "", b: "" };
    const scoreA = Number(input.a);
    const scoreB = Number(input.b);

    if (input.a.trim() === "" || input.b.trim() === "") {
      alert(`Enter both scores for Court ${court.courtNumber}.`);
      return;
    }

    if (!Number.isFinite(scoreA) || !Number.isFinite(scoreB)) {
      alert("Scores must be valid numbers.");
      return;
    }

    if (scoreA < 0 || scoreB < 0) {
      alert("Scores cannot be negative.");
      return;
    }

    if (scoreA === scoreB) {
      alert("A game cannot end in a tie.");
      return;
    }

    setFinishingCourt(court.courtNumber);

    try {
      await finishCourtGame(
        court.courtNumber,
        scoreA,
        scoreB
      );
    } catch (error) {
      console.error("Unable to finish court:", error);
      alert(
        `Unable to finish Court ${court.courtNumber}.\n\n${
          error instanceof Error ? error.message : String(error)
        }`
      );
    } finally {
      setFinishingCourt(null);
    }
  };

  // --------------------------------------------------
  // FINISH SESSION MANUALLY
  // --------------------------------------------------

  const handleFinishOpenPlay = async () => {
    if (!game || game.status !== "active") return;

    const confirmed = window.confirm(
      "End the open-play session now? Current results will remain saved and the final ranking will be shown."
    );

    if (!confirmed) return;

    try {
      await finishOpenPlay();
    } catch (error) {
      console.error("Unable to finish open play:", error);
      alert(
        `Unable to finish open play.\n\n${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  };

  // --------------------------------------------------
  // CLEAR SESSION
  // --------------------------------------------------


  const handleNewSessionKeepPlayers = async () => {
  if (!game) return;

  setClearingSession(true);

  try {
    // Keep the final session roster, including guests
    // and guests that were linked to accounts.
    const playersToKeep = Array.from(
      new Map(
        game.players.map((player) => [
          player.id,
          player,
        ])
      ).values()
    );

    await archiveOpenPlaySession();

    // Rebuild /queue from the final session roster.
    // This also removes stale duplicate queue entries.
    await replaceQueuePlayers(playersToKeep);

    await clearOpenPlay();

    setScores({});
    setGame(null);

    advancingCycleRef.current = false;
    endingSessionRef.current = false;

  } catch (error) {
    console.error(
      "Unable to start new session:",
      error
    );

    alert(
      `Unable to start a new session.\n\n${
        error instanceof Error
          ? error.message
          : String(error)
      }`
    );
  } finally {
    setClearingSession(false);
  }
};

const handleNewSessionClearPlayers = async () => {
  const confirmed = window.confirm(
    "Clear all registered players and start a completely new session?"
  );

  if (!confirmed) {
    return;
  }

  setClearingSession(true);

  try {
    // Remove every player from the current queue.
    await Promise.all(
      players.map((player) =>
        leaveQueue(player.id)
      )
    );

    // Clear game/session results.
    await archiveOpenPlaySession();
    await clearOpenPlay();

    setScores({});
    setGame(null);

    advancingCycleRef.current = false;
    endingSessionRef.current = false;

  } catch (error) {
    console.error(
      "Unable to clear players:",
      error
    );

    alert(
      `Unable to clear the session.\n\n${
        error instanceof Error
          ? error.message
          : String(error)
      }`
    );
  } finally {
    setClearingSession(false);
  }
};

  // --------------------------------------------------
  // RENDER HELPERS
  // --------------------------------------------------

  const getSessionPlayerStatus = (
  playerId: string
) => {
  if (!game) {
    return {
      label: "WAITING",
      type: "waiting" as const,
    };
  }

  const playingCourt =
    game.courts.find(
      (court) =>
        court.status === "playing" &&
        court.players.some(
          (player) =>
            player.id === playerId
        )
    );

  if (playingCourt) {
    return {
      label: `COURT ${playingCourt.courtNumber}`,
      type: "playing" as const,
    };
  }

  if (onBreakIds.has(playerId)) {
    return {
      label: "ON BREAK",
      type: "break" as const,
    };
  }

  const waitingIndex =
    readyWaitingPlayers.findIndex(
      (player) =>
        player.id === playerId
    );

  if (waitingIndex >= 0) {
    const upNextCount =
      4;

    if (waitingIndex < upNextCount) {
      return {
        label: `UP NEXT #${waitingIndex + 1}`,
        type: "next" as const,
      };
    }

    return {
      label: `WAITING #${waitingIndex + 1}`,
      type: "waiting" as const,
    };
  }

  return {
    label: "WAITING",
    type: "waiting" as const,
  };
};

  const handleOpenCourtEditor = (
  court: CourtState
) => {
  setEditingCourtNumber(
    court.courtNumber
  );
};

  const renderPlayer = (player: QueuePlayer) => {
  const isPlaying =
    currentCourtPlayerIds.has(player.id);

  const waitingPosition =
    waitingPositionById.get(player.id);

  const isNext =
    !isPlaying &&
    waitingPosition !== undefined &&
    waitingPosition <= 4;

  return (
    <div
      key={player.id}
      className={`flex items-center justify-between rounded-xl px-4 py-3 ${
        isPlaying
          ? "bg-slate-800"
          : isNext
            ? "border border-amber-400/40 bg-amber-500/10"
            : "bg-slate-800"
      }`}
    >
      <div className="flex min-w-0 items-center gap-3">
        <div
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-bold text-white ${
            isNext
              ? "bg-amber-500"
              : "bg-slate-700"
          }`}
        >
          {player.name
            .charAt(0)
            .toUpperCase()}
        </div>

        <span className="truncate font-semibold text-white">
          {player.name}
        </span>
      </div>

      {isPlaying ? (
        <span className="ml-3 shrink-0 rounded-full bg-emerald-500/20 px-2 py-1 text-xs font-bold text-emerald-300">
          PLAYING
        </span>
      ) : waitingPosition !== undefined ? (
        waitingPosition <= 4 ? (
          <span className="ml-3 shrink-0 rounded-full bg-amber-500/20 px-2 py-1 text-xs font-black text-amber-300">
            NEXT #{waitingPosition}
          </span>
        ) : (
          <span className="ml-3 shrink-0 rounded-full bg-slate-700 px-2 py-1 text-xs font-bold text-slate-300">
            WAITING #{waitingPosition}
          </span>
        )
      ) : isAdmin && game?.status !== "active" ? (
        <button
          type="button"
          onClick={() => void handleRemoveFromQueue(player)}
          aria-label={`Remove ${player.name} from the queue`}
          className="ml-3 shrink-0 rounded-lg px-2 py-1 text-xs font-black text-slate-400 hover:bg-red-500/20 hover:text-red-300"
        >
          REMOVE
        </button>
      ) : null}
    </div>
  );
};

  // Admin, before play starts: take someone out of the
  // queue (e.g. added by mistake or went home).
  const handleRemoveFromQueue = async (
    player: QueuePlayer
  ) => {
    if (
      !window.confirm(
        `Remove ${player.name} from the queue?`
      )
    ) {
      return;
    }

    try {
      await leaveQueue(player.id);
    } catch (error) {
      console.error("Unable to remove player from queue:", error);
      alert("Unable to remove player. Please try again.");
    }
  };

  const handleDraftScoreChange = (
    court: CourtState,
    team: "a" | "b",
    value: string
  ) => {
    const current = scores[court.courtNumber] ?? {
      a: court.draftScoreA ?? "",
      b: court.draftScoreB ?? "",
    };

    const nextScore = {
      ...current,
      [team]: value,
    };

    setScores((existing) => ({
      ...existing,
      [court.courtNumber]: nextScore,
    }));

    void saveCourtDraftScore(
      court.courtNumber,
      nextScore.a,
      nextScore.b
    ).catch((error) => {
      console.error(
        `Unable to save Court ${court.courtNumber} draft score:`,
        error
      );
    });
  };



  const [
    savingBreakId,
    setSavingBreakId,
  ] = useState<string | null>(null);

  const handleToggleBreak = async (
    playerId: string,
    onBreak: boolean
  ) => {
    setSavingBreakId(playerId);

    try {
      await setPlayerBreak(
        playerId,
        onBreak
      );
    } catch (error) {
      console.error(
        "Unable to update break:",
        error
      );

      alert(
        error instanceof Error
          ? error.message
          : "Unable to update break status."
      );
    } finally {
      setSavingBreakId(null);
    }
  };

  const handleAuthenticated = async (
    userId: string
  ) => {
    const profile =
      await getPlayerProfile(userId);

    setMyPlayerId(userId);
    setPlayerProfile(profile);

    localStorage.setItem(
      "pickleballPlayerId",
      userId
    );

    if (profile) {
      localStorage.setItem(
        "pickleballPlayerName",
        profile.name
      );
    }

    setShowAuth(false);
  };

  const handleSignOut = async () => {
    if (!window.confirm("Sign out of this device?")) {
      return;
    }

    try {
      // The auth listener clears the player state.
      await logout();
    } catch (error) {
      console.error("Unable to sign out:", error);
      alert("Unable to sign out. Please try again.");
    }
  };

  const getFixedPartner = (
    playerId: string
  ) => {
    const pair = (
      game?.fixedPairs ?? []
    ).find(
      (item) =>
        item.playerA === playerId ||
        item.playerB === playerId
    );

    if (!pair) {
      return null;
    }

    const partnerId =
      pair.playerA === playerId
        ? pair.playerB
        : pair.playerA;

    return (
      game?.players.find(
        (player) =>
          player.id === partnerId
      ) ?? null
    );
  };

  // ==================================================
  // SETUP SCREEN
  // ==================================================

  if (!game || game.status === "finished") {
    return (
      <div className="min-h-screen bg-slate-100 text-slate-950">
        <header className="bg-slate-950 px-6 py-6 text-white shadow-xl">
          <div className="mx-auto max-w-7xl">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.25em] text-cyan-400">
                  Pickleball Queue Pro
                </p>
                <h1 className="text-3xl font-black sm:text-4xl">
                  4-On / 4-Off Open Play
                </h1>
              </div>
              <span className="rounded-full bg-cyan-500/10 px-4 py-2 text-sm font-bold text-cyan-300">
                {game?.status === "finished" ? "SESSION FINISHED" : "SETUP"}
              </span>
            </div>
          </div>
        </header>

        <main className="mx-auto grid max-w-7xl gap-6 px-4 py-6 lg:grid-cols-[360px_1fr]">
          <aside className="space-y-6">
            <JoinQueueCard
              game={game}
              playerProfile={playerProfile}
              myPlayerId={myPlayerId}
              isMyPlayerRegistered={isMyPlayerRegistered}
              isMyPlayerOnCourt={isMyPlayerOnCourt}
              loading={loading}
              showAuth={showAuth}
              setShowAuth={setShowAuth}
              onAuthenticated={handleAuthenticated}
              onJoin={handleJoinQueue}
              onLeave={handleLeaveQueue}
              onSignOut={handleSignOut}
              onShowStats={() => myPlayerId && setStatsPlayerId(myPlayerId)}
            />

            <section className="rounded-2xl bg-white p-6 shadow-lg ring-1 ring-slate-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-black uppercase tracking-widest text-cyan-600">
                    Player Pool
                  </p>
                  <h2 className="text-2xl font-black">Registered Players</h2>
                </div>
                <span className="rounded-full bg-slate-100 px-3 py-2 font-black">
                  {registeredPlayerCount}
                </span>
              </div>

              <div className="mt-4 max-h-[420px] space-y-2 overflow-auto">
                {players.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-slate-300 p-5 text-center text-sm text-slate-500">
                    No players registered yet.
                  </p>
                ) : (
                  orderedPlayerPool.map(renderPlayer)
                )}
              </div>
            </section>
          </aside>

          <section className="space-y-6">
            {game?.status === "finished" ? (
              <FinalResults
                game={game!}
                isAdmin={isAdmin}
                rankedPlayers={rankedPlayers}
                sessionStats={sessionStats}
                clearingSession={clearingSession}
                onKeepPlayers={handleNewSessionKeepPlayers}
                onClearPlayers={handleNewSessionClearPlayers}
              />
            ) : !isAdmin ? (
              <section className="rounded-2xl bg-slate-950 p-6 text-white shadow-xl">
                <p className="text-xs font-black uppercase tracking-widest text-cyan-400">
                  Before Starting
                </p>
                <h2 className="mt-1 text-3xl font-black">Waiting for Open Play</h2>
                <p className="mt-2 max-w-2xl text-slate-400">
                  Join the queue and hang tight. An admin will start the session once enough players are in.
                </p>
              </section>
            ) : (
              <ConfigureOpenPlay
                players={players}
                registeredPlayerCount={registeredPlayerCount}
                  onShowJoinQr={() => setShowJoinQr(true)}
              />
            )}

            <div className="mt-6">
              <CompletedGames
                results={recentResults}
                onEdit={isAdmin ? setEditingResult : undefined}
              />
            </div>
          </section>
        </main>

        {statsModal}

      {editScoreModal}

      {joinQrModal}
      </div>
    );
  }

  // ==================================================
  // ACTIVE OPEN PLAY
  // ==================================================

  return (
    <div className="min-h-screen bg-slate-100 text-slate-950">

      {statsModal}

        {editScoreModal}

      {joinQrModal}

      {showAuth && !playerProfile && (
        <div className="fixed inset-0 z-[125] flex items-center justify-center bg-slate-950/80 p-4">
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-4">
            <PlayerAuth
              onAuthenticated={handleAuthenticated}
            />

            <button
              type="button"
              onClick={() => setShowAuth(false)}
              className="mt-3 w-full rounded-xl border border-slate-300 px-4 py-3 font-bold text-slate-700"
            >
              CANCEL
            </button>
          </div>
        </div>
      )}

      {activeAlert && (
        <div className="fixed inset-x-0 top-0 z-[130] flex justify-center p-4">
          <div
            role="alert"
            className="flex w-full max-w-md items-center gap-4 rounded-2xl bg-emerald-500 p-4 text-white shadow-2xl"
          >
            <div className="min-w-0 flex-1">
              <p className="text-lg font-black">
                {activeAlert.title}
              </p>
              <p className="text-sm font-semibold text-emerald-50">
                {activeAlert.body}
              </p>
            </div>

            <button
              type="button"
              onClick={dismissAlert}
              className="rounded-lg bg-white/20 px-3 py-2 font-black hover:bg-white/30"
            >
              OK
            </button>
          </div>
        </div>
      )}

      {/* ============================================= */}
      {/* HEADER */}
      {/* ============================================= */}

      <header className="bg-slate-950 px-4 py-5 text-white shadow-xl sm:px-6">
        <div className="mx-auto max-w-7xl">

          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">

            <div>
              <p className="text-xs font-black uppercase tracking-[0.25em] text-cyan-400">
                Pickleball Queue Pro
              </p>

              <h1 className="text-3xl font-black">
                4-On / 4-Off Open Play
              </h1>

              <p className="mt-1 text-sm text-slate-400">
                Cycle {game.cycleNumber} ·{" "}
                {game.playerCount} players ·{" "}
                {game.courtCount} court
                {game.courtCount === 1
                  ? ""
                  : "s"}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">

              {/* ACCOUNT */}
              {playerProfile ? (
                <button
                  type="button"
                  onClick={() => void handleSignOut()}
                  className="rounded-xl bg-slate-900 px-4 py-3 text-left hover:bg-slate-800"
                >
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Signed in
                  </p>
                  <p className="max-w-[160px] truncate font-black">
                    {playerProfile.name}
                  </p>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowAuth(true)}
                  className="rounded-xl bg-cyan-500 px-4 py-3 font-black text-slate-950 hover:bg-cyan-400"
                >
                  SIGN IN
                </button>
              )}

              {/* TIME LEFT */}
              <div className="rounded-xl bg-slate-900 px-4 py-3">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Time Left
                </p>

                <p className="text-xl font-black text-emerald-400">
                  {formatRemaining(
                    remainingMs
                  )}
                </p>
              </div>

              {/* STARTED */}
              <div className="rounded-xl bg-slate-900 px-4 py-3">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Started
                </p>

                <p className="text-sm font-black text-white">
                  {formatTime(
                    game.startedAt
                  )}
                </p>
              </div>

              {/* STATUS */}
              <div className="rounded-xl bg-emerald-500/20 px-4 py-3">
                <p className="text-xs font-bold uppercase tracking-wider text-emerald-300">
                  Status
                </p>

                <p className="text-sm font-black text-emerald-300">
                  OPEN PLAY
                </p>
              </div>

            </div>
          </div>

        </div>
      </header>

      {/* ============================================= */}
      {/* MAIN */}
      {/* ============================================= */}

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6">

        {/* =========================================== */}
        {/* SUMMARY CARDS */}
        {/* =========================================== */}

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">

          {/* CYCLE */}
          <div className="rounded-2xl bg-white p-5 shadow ring-1 ring-slate-200">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Cycle
            </p>

            <p className="mt-1 text-3xl font-black">
              {game.cycleNumber}
            </p>
          </div>

          {/* COURTS */}
          <div className="rounded-2xl bg-white p-5 shadow ring-1 ring-slate-200">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Courts
            </p>

            <p className="mt-1 text-3xl font-black">
              {game.courts.filter(
                (court) =>
                  court.status === "completed"
              ).length}/
              {game.courtCount}
            </p>
          </div>

          {/* PLAYERS */}
          <div className="rounded-2xl bg-white p-5 shadow ring-1 ring-slate-200">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Players
            </p>

            <p className="mt-1 text-3xl font-black">
              {game.playerCount}
            </p>
          </div>

          {/* ENDS */}
          <div className="rounded-2xl bg-white p-5 shadow ring-1 ring-slate-200">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Ends
            </p>

            <p className="mt-1 text-3xl font-black">
              {formatTime(
                game.endsAt
              )}
            </p>
          </div>

        </section>

        {/* =========================================== */}
        {/* MAIN TWO COLUMN LAYOUT */}
        {/* =========================================== */}

        <div className="grid gap-6 lg:grid-cols-[1fr_340px]">

          {/* ========================================= */}
          {/* LEFT COLUMN */}
          {/* ========================================= */}

          <section className="space-y-6">

            {/* CURRENT CYCLE HEADER */}
            <div className="rounded-2xl bg-slate-950 p-5 text-white shadow-xl">

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">

                <div>
                  <p className="text-xs font-black uppercase tracking-widest text-cyan-400">
                    Current Cycle
                  </p>

                  <h2 className="text-2xl font-black">
                    All Courts
                  </h2>
                </div>

                <p className="text-sm text-slate-400">
                  Finish every court to start
                  the next cycle.
                </p>

              </div>

            </div>

            {/* COURTS */}
            <div
              className={`grid gap-6 ${
                game.courtCount > 1
                  ? "xl:grid-cols-2"
                  : "max-w-xl"
              }`}
            >
              {game.courts.map((court) => (
                <CourtCard
                  key={court.courtNumber}
                  court={court}
                  score={
                    scores[court.courtNumber] ?? {
                      a: court.draftScoreA ?? "",
                      b: court.draftScoreB ?? "",
                    }
                  }
                  now={now}
                  isAdmin={isAdmin}
                  finishing={finishingCourt === court.courtNumber}
                  onEdit={() => handleOpenCourtEditor(court)}
                  onScoreChange={(team, value) =>
                    handleDraftScoreChange(court, team, value)
                  }
                  onFinish={() => void handleFinishCourt(court)}
                />
              ))}
            </div>

            {/* ======================================= */}
            {/* SESSION CONTROL */}
            {/* ======================================= */}

            {isAdmin && (
            <section className="rounded-2xl bg-slate-950 p-5 text-white shadow-xl">

              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">

                <div>
                  <p className="text-xs font-black uppercase tracking-widest text-amber-400">
                    Session Control
                  </p>

                  <h2 className="text-xl font-black">
                    End Open Play
                  </h2>

                  <p className="mt-1 text-sm text-slate-400">
                    Use this only when the
                    scheduled open-play session
                    should end early.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    void handleFinishOpenPlay()
                  }
                  className="rounded-xl border border-red-400/40 bg-red-500/10 px-5 py-3 font-black text-red-300 transition hover:bg-red-500/20"
                >
                  END SESSION
                </button>

              </div>

            </section>
            )}

            <CompletedGames
              results={recentResults}
              onEdit={isAdmin ? setEditingResult : undefined}
            />

          </section>

          {/* ========================================= */}
          {/* RIGHT COLUMN */}
          {/* ========================================= */}

          <aside className="space-y-6">

            {/* ======================================= */}
            {/* PLAYER QUEUE */}
            {/* ======================================= */}

            <PlayerQueuePanel
              isAdmin={isAdmin}
              registeredPlayerCount={registeredPlayerCount}
              onCourtPlayers={onCourtPlayers}
              upNextPlayers={upNextPlayers}
              laterWaitingPlayers={laterWaitingPlayers}
              onBreakPlayers={onBreakPlayers}
              statsPlayerOptions={statsPlayerOptions}
              savingBreakId={savingBreakId}
              onToggleBreak={handleToggleBreak}
              onManagePlayers={() => setShowManagePlayers(true)}
              onShowHistory={() => setShowSessionHistory(true)}
              onShowStats={setStatsPlayerId}
      onShowJoinQr={() => setShowJoinQr(true)}
            />

            {/* ======================================= */}
            {/* LIVE RANKING */}
            {/* ======================================= */}

            <LiveRanking
              rankedPlayers={rankedPlayers}
            />

            {/* ======================================= */}
            {/* PLAYER STATUS */}
            {/* ======================================= */}

            <PlayerStatusCard
              myPlayerId={myPlayerId}
              myCourtNumber={myCourtNumber}
              myWaitingPosition={myWaitingPosition}
              upNextCount={upNextCount}
              isMyPlayerRegistered={isMyPlayerRegistered}
              isMyPlayerOnCourt={isMyPlayerOnCourt}
              isMyPlayerOnBreak={isMyPlayerOnBreak}
              savingBreakId={savingBreakId}
              alertsEnabled={alertsEnabled}
              enableAlerts={enableAlerts}
              disableAlerts={disableAlerts}
              pushResult={pushResult}
              onToggleBreak={handleToggleBreak}
              onShowStats={() => myPlayerId && setStatsPlayerId(myPlayerId)}
            />

          </aside>

        </div>

      </main>

{editingCourtNumber !== null && game && (
  <Suspense fallback={null}>
  <CourtEditorModal
    game={game}
    courtNumber={editingCourtNumber}
    onClose={() => setEditingCourtNumber(null)}
  />
  </Suspense>
)}

{showManagePlayers && game && (
  <Suspense fallback={null}>
  <ManagePlayersModal
    game={game}
    onClose={() => setShowManagePlayers(false)}
    getSessionPlayerStatus={getSessionPlayerStatus}
    getFixedPartner={getFixedPartner}
    onBreakIds={onBreakIds}
    savingBreakId={savingBreakId}
    onToggleBreak={handleToggleBreak}
  />
  </Suspense>
)}

{showSessionHistory && (
  <Suspense fallback={null}>
  <SessionHistoryModal
    sessions={archivedSessions}
    onClose={() => setShowSessionHistory(false)}
  />
  </Suspense>
)}

    </div>
  );
}

export default App;
