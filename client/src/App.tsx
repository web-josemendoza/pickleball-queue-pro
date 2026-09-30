import PlayerAuth from "./components/PlayerAuth";
import PairRulesEditor from "./components/PairRulesEditor";
import PlayerStatsModal from "./components/PlayerStatsModal";
import CompletedGames, {
  type CompletedGame,
} from "./components/CompletedGames";
import EditScoreModal from "./components/EditScoreModal";
import {
  formatGameDuration,
  formatTime,
} from "./lib/format";
import { usePlayerAlerts } from "./hooks/usePlayerAlerts";
import {
  formatClock,
  getCourtElapsedMs,
  isLongGame,
  LONG_GAME_MINUTES,
} from "./lib/courtTiming";

import { logout, subscribeToAuth } from "./lib/auth";

import {
  getPlayerProfile,
  getAllPlayerProfiles,
  formatSkillLevel,
  SKILL_LEVELS,
  type PlayerProfile,
  type SkillLevel,
} from "./lib/player";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
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
  createInitialCycle,
} from "./lib/fourOnFour";

import {
  addPendingPair,
  addSessionPair,
  addGuestPlayerToSession,
  archiveOpenPlaySession,
  clearOpenPlay,
  deleteArchivedSession,
  correctGameScore,
  finishCourtGame,
  finishOpenPlay,
  getRankedPlayers,
  linkGuestPlayerToAccount,
  removePendingPair,
  removeSessionPair,
  removePlayerFromSession,
  saveCourtDraftScore,
  setPlayerBreak,
  setSkillBalance,
  startNextCycle,
  startOpenPlay,
  subscribeToOpenPlay,
  subscribeToPendingPairRules,
  subscribeToSessionHistory,
  updateCourtLineup,
  type ArchivedOpenPlaySession,
  type CourtState,
  type PairRules,
  type OpenPlayState,
  type PlayerStats,
} from "./lib/game";

import {
  calculateSessionEndTime,
  isSessionFinished,
  validateSession,
  type OpenPlaySession,
} from "./lib/session";

type ScoreInput = {
  a: string;
  b: string;
};

type ScoreInputs = Record<number, ScoreInput>;



function formatDurationMs(
  milliseconds: number
): string {
  if (
    !Number.isFinite(milliseconds) ||
    milliseconds <= 0
  ) {
    return "0m 00s";
  }

  const totalSeconds = Math.floor(
    milliseconds / 1000
  );

  const hours = Math.floor(
    totalSeconds / 3600
  );

  const minutes = Math.floor(
    (totalSeconds % 3600) / 60
  );

  const seconds =
    totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  return `${minutes}m ${String(
    seconds
  ).padStart(2, "0")}s`;
}

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


function getCourtTeamPlayers(court: CourtState) {
  return {
    teamA: court.players.slice(0, 2),
    teamB: court.players.slice(2, 4),
  };
}

function formatSessionDate(
  timestamp: number | null
) {
  if (!timestamp) {
    return "Unknown Date";
  }

  return new Date(
    timestamp
  ).toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatSessionTime(
  timestamp: number | null
) {
  if (!timestamp) {
    return "--";
  }

  return new Date(
    timestamp
  ).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

function App() {

  const [
  editingCourtNumber,
  setEditingCourtNumber,
] = useState<number | null>(null);

const handleDeleteArchivedSession =
  async (sessionId: string) => {
    const confirmed = window.confirm(
      "Delete this archived session?"
    );

    if (!confirmed) return;

    try {
      await deleteArchivedSession(
        sessionId
      );

      setSelectedArchivedSession(
        null
      );
    } catch (error) {
      console.error(
        "Failed to delete archived session:",
        error
      );

      alert(
        "Failed to delete session."
      );
    }
  };
  
const [
  archivedSessions,
  setArchivedSessions,
] = useState<ArchivedOpenPlaySession[]>([]);

const [
  showSessionHistory,
  setShowSessionHistory,
] = useState(false);

const [
  selectedArchivedSession,
  setSelectedArchivedSession,
] = useState<ArchivedOpenPlaySession | null>(null);

const [
  adminLineupIds,
  setAdminLineupIds,
] = useState<string[]>([]);

const [
  savingAdminLineup,
  setSavingAdminLineup,
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

const [setupCourtCount, setSetupCourtCount] =
  useState("1");

const [setupDurationHours, setSetupDurationHours] =
  useState("1");

  const [editingResult, setEditingResult] =
    useState<CompletedGame | null>(null);
  const [scores, setScores] = useState<ScoreInputs>({});
  const [finishingCourt, setFinishingCourt] = useState<number | null>(null);
  const [startingOpenPlay, setStartingOpenPlay] = useState(false);
  const [clearingSession, setClearingSession] = useState(false);

  const [showNewSessionOptions, setShowNewSessionOptions] =
    useState(false);

  const [now, setNow] = useState(Date.now());

const [
  showManagePlayers,
  setShowManagePlayers,
] = useState(false);

const [
  guestPlayerName,
  setGuestPlayerName,
] = useState("");

const [
  guestSkillLevel,
  setGuestSkillLevel,
] = useState<SkillLevel>(3.0);

const [
  addingGuestPlayer,
  setAddingGuestPlayer,
] = useState(false);

const [
  removingPlayerId,
  setRemovingPlayerId,
] = useState<string | null>(null);

const [
  registeredProfiles,
  setRegisteredProfiles,
] = useState<PlayerProfile[]>([]);

const [
  linkingGuestId,
  setLinkingGuestId,
] = useState<string | null>(null);

const [
  selectedLinkAccountId,
  setSelectedLinkAccountId,
] = useState<string>("");

const [
  savingGuestLink,
  setSavingGuestLink,
] = useState(false);

const [
  pendingPairRules,
  setPendingPairRules,
] = useState<PairRules>({
  fixedPairs: [],
  keepApartPairs: [],
});

const [
  setupSkillBalance,
  setSetupSkillBalance,
] = useState(false);

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
    return subscribeToPendingPairRules(
      setPendingPairRules
    );
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

  useEffect(() => {
    if (!showManagePlayers) {
      return;
    }

    void getAllPlayerProfiles()
      .then((profiles) => {
        setRegisteredProfiles(
          profiles.sort((a, b) =>
            a.name.localeCompare(b.name)
          )
        );
      })
      .catch((error) => {
        console.error(
          "Unable to load registered player accounts:",
          error
        );
      });
  }, [showManagePlayers]);

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
  activeAlert,
  dismissAlert,
} = usePlayerAlerts(
  myPlayingCourtNumber,
  myWaitingPosition !== null &&
    myWaitingPosition <= upNextCount
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
    <PlayerStatsModal
      key={statsPlayerId}
      sessions={statsSessions}
      initialPlayerId={statsPlayerId}
      playerOptions={
        isAdmin ? statsPlayerOptions : undefined
      }
      onClose={() => setStatsPlayerId(null)}
    />
  );

  const editScoreModal = isAdmin && editingResult && (
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

  const handleStartOpenPlay = async () => {
    const playerCount = players.length;
    const courtCount = Number(setupCourtCount);
    const durationHours = Number(setupDurationHours);

    if (!Number.isInteger(courtCount) || courtCount < 1) {
  alert("You need at least 1 available court.");
  return;
}

    if (
  !Number.isFinite(durationHours) ||
  durationHours < 1
) {
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
        `You need at least ${playablePlayerCount} players to fill ${courtCount} courts.`
      );
      return;
    }

    const initialCycle = createInitialCycle(
      players,
      courtCount,
      1
    );

    if (initialCycle.courts.length !== courtCount) {
      alert("Unable to create a complete first cycle. Check the player and court counts.");
      return;
    }

    setStartingOpenPlay(true);

    try {
      await startOpenPlay(
  playerCount,
  courtCount,
  durationHours,
  players,
  {
    ...pendingPairRules,
    skillBalance: setupSkillBalance,
  }
);
    } catch (error) {
      console.error("Unable to start open play:", error);
      alert(
        `Unable to start open play.\n\n${
          error instanceof Error ? error.message : String(error)
        }`
      );
    } finally {
      setStartingOpenPlay(false);
    }
  };

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

    setShowNewSessionOptions(false);
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

    setShowNewSessionOptions(false);
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

  setAdminLineupIds(
    court.players.map(
      (player) => player.id
    )
  );
};

const handleCloseCourtEditor = () => {
  if (savingAdminLineup) {
    return;
  }

  setEditingCourtNumber(null);
  setAdminLineupIds([]);
};

const handleAdminLineupChange = (
  slotIndex: number,
  playerId: string
) => {
  setAdminLineupIds(
    (current) => {
      const next = [...current];

      next[slotIndex] =
        playerId;

      return next;
    }
  );
};

const getAdminPlayerStatus = (
  playerId: string
) => {
  if (!game) {
    return {
      label: "",
      unavailable: false,
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
    const isEditingThisCourt =
      playingCourt.courtNumber ===
      editingCourtNumber;

    return {
      label: `COURT ${playingCourt.courtNumber}`,
      unavailable:
        !isEditingThisCourt,
    };
  }

  const waitingIndex =
    (
      game.waitingPlayers ?? []
    ).findIndex(
      (player) =>
        player.id === playerId
    );

  if (waitingIndex >= 0) {
    const nextCount =
      4;

    if (
      waitingIndex <
      nextCount
    ) {
      return {
        label: `UP NEXT #${
          waitingIndex + 1
        }`,
        unavailable: false,
      };
    }

    return {
      label: `WAITING #${
        waitingIndex + 1
      }`,
      unavailable: false,
    };
  }

  return {
    label: "AVAILABLE",
    unavailable: false,
  };
};

const handleSaveAdminLineup =
  async () => {
    if (
      editingCourtNumber === null
    ) {
      return;
    }

    if (
      adminLineupIds.length !== 4
    ) {
      alert(
        "Please select exactly 4 players."
      );

      return;
    }

    if (
      adminLineupIds.some(
        (playerId) =>
          !playerId
      )
    ) {
      alert(
        "Please select a player for every position."
      );

      return;
    }

    if (
      new Set(
        adminLineupIds
      ).size !== 4
    ) {
      alert(
        "The same player cannot be selected twice."
      );

      return;
    }

    setSavingAdminLineup(true);

    try {
      await updateCourtLineup(
        editingCourtNumber,
        adminLineupIds
      );

      setEditingCourtNumber(
        null
      );

      setAdminLineupIds(
        []
      );
    } catch (error) {
      console.error(
        "Unable to update court lineup:",
        error
      );

      alert(
        `Unable to update court lineup.\n\n${
          error instanceof Error
            ? error.message
            : String(error)
        }`
      );
    } finally {
      setSavingAdminLineup(
        false
      );
    }
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
      ) : null}
    </div>
  );
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

  const renderCourt = (court: CourtState) => {
    const { teamA, teamB } = getCourtTeamPlayers(court);
    const score = scores[court.courtNumber] ?? {
      a: court.draftScoreA ?? "",
      b: court.draftScoreB ?? "",
    };
    const teamAWon =
      court.status === "completed" &&
      court.scoreA !== null &&
      court.scoreB !== null &&
      court.scoreA > court.scoreB;
    const teamBWon =
      court.status === "completed" &&
      court.scoreA !== null &&
      court.scoreB !== null &&
      court.scoreB > court.scoreA;

    const longGame = isLongGame(court, now);

    return (
      <section
        key={court.courtNumber}
        className={`rounded-2xl border bg-slate-900 p-5 shadow-xl ${
          longGame
            ? "border-amber-400"
            : "border-slate-700"
        }`}
      >
        <div className="mb-5 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-cyan-400">
              Court {court.courtNumber}
            </p>
            <h2 className="text-2xl font-black text-white">
              {court.status === "completed" ? "Game Complete" : "Game On"}
            </h2>
          </div>

          <div className="flex flex-col items-end gap-1">
            <span
              className={`rounded-full px-3 py-1 text-xs font-bold ${
                court.status === "completed"
                  ? "bg-emerald-500/20 text-emerald-300"
                  : "bg-cyan-500/20 text-cyan-300"
              }`}
            >
              {court.status.toUpperCase()}
            </span>

            {court.status === "playing" && (
              <span
                className={`text-sm font-black tabular-nums ${
                  longGame
                    ? "text-amber-300"
                    : "text-slate-400"
                }`}
              >
                ⏱ {formatClock(
                  getCourtElapsedMs(court, now)
                )}
              </span>
            )}
          </div>
        </div>

        {longGame && (
          <p className="-mt-2 mb-4 rounded-xl bg-amber-500/15 px-4 py-2 text-sm font-bold text-amber-200">
            This game has run over {LONG_GAME_MINUTES} minutes. Check that the score was entered.
          </p>
        )}

{isAdmin &&
  court.status === "playing" && (
    <button
      type="button"
      onClick={() =>
        handleOpenCourtEditor(
          court
        )
      }
      className="mb-4 w-full rounded-xl border border-amber-400/40 bg-amber-500/10 px-4 py-3 text-sm font-black text-amber-300 transition hover:bg-amber-500/20"
    >
      EDIT PLAYERS & TEAMS
    </button>
  )}

        <div className="grid gap-4 md:grid-cols-2">
          <div
            className={`rounded-xl border p-4 ${
              teamAWon
                ? "border-emerald-500/60 bg-emerald-500/10"
                : "border-slate-700 bg-slate-950/50"
            }`}
          >
            <div className="mb-3 flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Team A
              </span>
              {teamAWon && (
                <span className="text-xs font-bold text-emerald-300">WINNER</span>
              )}
            </div>

            <div className="space-y-2">
              {teamA.map((player) => (
                <div
                  key={player.id}
                  className="rounded-lg bg-slate-800 px-3 py-3 font-semibold text-white"
                >
                  {player.name}
                </div>
              ))}
            </div>

            {court.status === "playing" ? (
              <input
                type="number"
                min="0"
                value={score.a}
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                  handleDraftScoreChange(
                    court,
                    "a",
                    event.target.value
                  )
                }
                placeholder="Score"
                className="mt-4 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-4 text-center text-3xl font-black text-white outline-none focus:border-cyan-400"
              />
            ) : (
              <div className="mt-4 rounded-xl bg-slate-950 px-4 py-4 text-center text-3xl font-black text-white">
                {court.scoreA ?? 0}
              </div>
            )}
          </div>

          <div
            className={`rounded-xl border p-4 ${
              teamBWon
                ? "border-emerald-500/60 bg-emerald-500/10"
                : "border-slate-700 bg-slate-950/50"
            }`}
          >
            <div className="mb-3 flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Team B
              </span>
              {teamBWon && (
                <span className="text-xs font-bold text-emerald-300">WINNER</span>
              )}
            </div>

            <div className="space-y-2">
              {teamB.map((player) => (
                <div
                  key={player.id}
                  className="rounded-lg bg-slate-800 px-3 py-3 font-semibold text-white"
                >
                  {player.name}
                </div>
              ))}
            </div>

            {court.status === "playing" ? (
              <input
                type="number"
                min="0"
                value={score.b}
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                  handleDraftScoreChange(
                    court,
                    "b",
                    event.target.value
                  )
                }
                placeholder="Score"
                className="mt-4 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-4 text-center text-3xl font-black text-white outline-none focus:border-cyan-400"
              />
            ) : (
              <div className="mt-4 rounded-xl bg-slate-950 px-4 py-4 text-center text-3xl font-black text-white">
                {court.scoreB ?? 0}
              </div>
            )}
          </div>
        </div>

        {court.status === "playing" && (
          <button
            type="button"
            disabled={finishingCourt === court.courtNumber}
            onClick={() => void handleFinishCourt(court)}
            className="mt-4 w-full rounded-xl bg-emerald-500 px-5 py-4 font-black text-white transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {finishingCourt === court.courtNumber
              ? "SAVING RESULT..."
              : `FINISH COURT ${court.courtNumber}`}
          </button>
        )}
      </section>
    );
  };
const handleAddGuestPlayer =
  async () => {
    if (!guestPlayerName.trim()) {
      alert(
        "Please enter the player's name."
      );
      return;
    }

    setAddingGuestPlayer(true);

    try {
      await addGuestPlayerToSession(
        guestPlayerName,
        guestSkillLevel
      );

      setGuestPlayerName("");
      setGuestSkillLevel(3.0);
    } catch (error) {
      console.error(
        "Unable to add guest player:",
        error
      );

      alert(
        error instanceof Error
          ? error.message
          : "Unable to add player."
      );
    } finally {
      setAddingGuestPlayer(false);
    }
  };

  const handleLinkGuestPlayer =
    async (
      guestPlayerId: string
    ) => {
      if (!selectedLinkAccountId) {
        alert(
          "Choose a registered account first."
        );
        return;
      }

      const profile =
        registeredProfiles.find(
          (item) =>
            item.playerId ===
            selectedLinkAccountId
        );

      if (!profile) {
        alert(
          "Registered player account not found."
        );
        return;
      }

      const confirmed =
        window.confirm(
          `Link this guest to ${profile.name}'s registered account? The guest's current-session games and stats will move to that account.`
        );

      if (!confirmed) {
        return;
      }

      setSavingGuestLink(true);

      try {
        await linkGuestPlayerToAccount(
          guestPlayerId,
          {
            id: profile.playerId,
            name: profile.name,
            skillLevel:
              profile.skillLevel,
            joinedAt: Date.now(),
          }
        );

        setLinkingGuestId(null);
        setSelectedLinkAccountId("");
      } catch (error) {
        console.error(
          "Unable to link guest account:",
          error
        );

        alert(
          error instanceof Error
            ? error.message
            : "Unable to link guest account."
        );
      } finally {
        setSavingGuestLink(false);
      }
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

  const handleRemoveSessionPlayer =
  async (
    playerId: string,
    playerName: string
  ) => {
    const status =
      getSessionPlayerStatus(
        playerId
      );

    if (status.type === "playing") {
      alert(
        `${playerName} is currently playing. Use EDIT PLAYERS & TEAMS first to replace this player.`
      );

      return;
    }

    const confirmed =
      window.confirm(
        `Remove ${playerName} from this session?`
      );

    if (!confirmed) {
      return;
    }

    setRemovingPlayerId(
      playerId
    );

    try {
      await removePlayerFromSession(
        playerId
      );
    } catch (error) {
      console.error(
        "Unable to remove player:",
        error
      );

      alert(
        error instanceof Error
          ? error.message
          : "Unable to remove player."
      );
    } finally {
      setRemovingPlayerId(
        null
      );
    }
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
          Skill Level{" "}
          {formatSkillLevel(
            playerProfile.skillLevel
          )}
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
        onClick={() =>
          setStatsPlayerId(myPlayerId)
        }
        className="mt-3 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-xs font-black uppercase tracking-wider text-slate-700 hover:bg-slate-100"
      >
        📊 My Stats
      </button>
    )}

    <button
      type="button"
      onClick={() => void handleSignOut()}
      className="mt-2 w-full rounded-xl px-4 py-2 text-xs font-bold text-slate-500 hover:bg-slate-100"
    >
      Sign out
    </button>
  </div>
)}
<button
  type="button"
  onClick={() => void handleJoinQueue()}
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
  onClick={() =>
    void handleLeaveQueue()
  }
  disabled={
    !isMyPlayerRegistered ||
    isMyPlayerOnCourt
  }
  className="mt-3 w-full rounded-xl border border-slate-300 px-4 py-3 font-bold text-slate-700 disabled:opacity-50"
>
  {isMyPlayerOnCourt
    ? "CURRENTLY PLAYING"
    : "LEAVE QUEUE"}
</button>
              
            </section>

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
              <section className="rounded-2xl bg-slate-950 p-6 text-white shadow-xl">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-xs font-black uppercase tracking-widest text-emerald-400">
                      Final Results
                    </p>
                    <h2 className="mt-1 text-3xl font-black">Open Play Complete</h2>
                    
                    <p className="mt-2 text-slate-400">
                      {game.playerCount} players · {game.courtCount} courts · {game.durationHours} hours
                    </p>
                  </div>

                  {/* SESSION SUMMARY */}

<div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">

  <div className="rounded-xl bg-slate-900 p-4">
    <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
      Total Games
    </p>

    <p className="mt-1 text-2xl font-black text-white">
      {sessionStats.totalGames}
    </p>
  </div>

  <div className="rounded-xl bg-slate-900 p-4">
    <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
      Cycles
    </p>

    <p className="mt-1 text-2xl font-black text-white">
      {sessionStats.totalCycles}
    </p>
  </div>

  <div className="rounded-xl bg-slate-900 p-4">
    <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
      Avg Game
    </p>

    <p className="mt-1 text-2xl font-black text-cyan-300">
      {formatDurationMs(
        sessionStats.averageDuration
      )}
    </p>
  </div>

  <div className="rounded-xl bg-slate-900 p-4">
    <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
      Longest Game
    </p>

    <p className="mt-1 text-2xl font-black text-emerald-300">
      {formatDurationMs(
        sessionStats.longestDuration
      )}
    </p>
  </div>

</div>
                  {isAdmin && (
                  <button
                  type="button"
                  onClick={() =>
                    setShowNewSessionOptions(true)
                  }
                  disabled={clearingSession}
                  className="rounded-xl bg-white px-5 py-3 font-black text-slate-950 transition hover:bg-slate-100 disabled:opacity-50"
                >
                  {clearingSession
                    ? "PLEASE WAIT..."
                    : "NEW SESSION"}
                </button>
                  )}

                {isAdmin && showNewSessionOptions && (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4">
    <div className="w-full max-w-md rounded-2xl bg-white p-6 text-slate-950 shadow-2xl">

      <p className="text-xs font-black uppercase tracking-widest text-cyan-600">
        New Session
      </p>

      <h2 className="mt-2 text-2xl font-black">
        Start another Open Play?
      </h2>

      <p className="mt-2 text-sm leading-6 text-slate-500">
        Choose whether the currently registered
        players should stay in the player pool.
      </p>

      <div className="mt-6 space-y-3">

        <button
          type="button"
          onClick={() =>
            void handleNewSessionKeepPlayers()
          }
          disabled={clearingSession}
          className="w-full rounded-xl bg-emerald-500 px-5 py-4 text-left font-black text-white hover:bg-emerald-400 disabled:opacity-50"
        >
          <span className="block">
            KEEP PLAYERS
          </span>

          <span className="mt-1 block text-xs font-medium opacity-80">
            Keep all registered players and reset
            courts, games, ranking, and timer.
          </span>
        </button>

        <button
          type="button"
          onClick={() =>
            void handleNewSessionClearPlayers()
          }
          disabled={clearingSession}
          className="w-full rounded-xl bg-red-50 px-5 py-4 text-left font-black text-red-700 hover:bg-red-100 disabled:opacity-50"
        >
          <span className="block">
            CLEAR PLAYERS
          </span>

          <span className="mt-1 block text-xs font-medium text-red-500">
            Remove everyone from the current
            player pool and start fresh.
          </span>
        </button>

        <button
          type="button"
          onClick={() =>
            setShowNewSessionOptions(false)
          }
          disabled={clearingSession}
          className="w-full rounded-xl border border-slate-300 px-5 py-3 font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
        >
          CANCEL
        </button>

      </div>
    </div>
  </div>
)}
                </div>
{/* PLAYER STATS */}

<div className="mt-6">
  <div className="mb-4">
    <p className="text-xs font-black uppercase tracking-widest text-cyan-400">
      Player Stats
    </p>

    <h3 className="text-xl font-black text-white">
      Performance Breakdown
    </h3>
  </div>

  <div className="overflow-x-auto rounded-xl border border-slate-800">
    <div className="min-w-[760px]">

      {/* HEADER */}
      <div className="grid grid-cols-[48px_1fr_70px_70px_70px_80px_70px_70px_80px] gap-3 bg-slate-900 px-4 py-3 text-xs font-black uppercase tracking-wider text-slate-400">
  <span>#</span>
  <span>Player</span>
  <span>Games</span>
  <span>Wins</span>
  <span>Losses</span>
  <span>Win %</span>
  <span>PF</span>
  <span>PA</span>
  <span>+/-</span>
</div>

      {rankedPlayers.map((player, index) => {
        const winRate =
          player.gamesPlayed > 0
            ? Math.round(
                (player.wins /
                  player.gamesPlayed) *
                  100
              )
            : 0;

        const pointDiff =
          player.pointsFor -
          player.pointsAgainst;

        return (
          <div
  key={`stats-${player.playerId}`}
  className={`grid grid-cols-[48px_1fr_70px_70px_70px_80px_70px_70px_80px] items-center gap-3 border-t border-slate-800 px-4 py-3 text-sm ${
    index === 0
      ? "bg-amber-400/10"
      : index === 1
        ? "bg-slate-300/10"
        : index === 2
          ? "bg-orange-500/10"
          : ""
  }`}
>
  <span
    className={`flex h-8 w-8 items-center justify-center rounded-full font-black ${
      index === 0
        ? "bg-amber-400 text-slate-950"
        : index === 1
          ? "bg-slate-300 text-slate-950"
          : index === 2
            ? "bg-orange-500 text-white"
            : "text-cyan-400"
    }`}
  >
    {index === 0
      ? "🥇"
      : index === 1
        ? "🥈"
        : index === 2
          ? "🥉"
          : index + 1}
  </span>

  <span className="truncate font-bold text-white">
    {player.name}
  </span>

  <span className="text-slate-300">
    {player.gamesPlayed}
  </span>

  <span className="font-black text-emerald-300">
    {player.wins}
  </span>

  <span className="text-red-300">
    {player.losses}
  </span>

  <span className="font-bold text-white">
    {winRate}%
  </span>

  <span className="text-slate-300">
    {player.pointsFor}
  </span>

  <span className="text-slate-300">
    {player.pointsAgainst}
  </span>

  <span
    className={`font-black ${
      pointDiff > 0
        ? "text-emerald-300"
        : pointDiff < 0
          ? "text-red-300"
          : "text-slate-400"
    }`}
  >
    {pointDiff > 0
      ? `+${pointDiff}`
      : pointDiff}
  </span>
</div>
        );
      })}
    </div>
  </div>
</div>
                
              </section>
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
              <section className="rounded-2xl bg-slate-950 p-6 text-white shadow-xl">
                <p className="text-xs font-black uppercase tracking-widest text-cyan-400">
                  Before Starting
                </p>
                <h2 className="mt-1 text-3xl font-black">Configure Open Play</h2>
                <p className="mt-2 max-w-2xl text-slate-400">
                  The player count is taken directly from the registered queue. Choose the number of available courts and the open-play duration.
                </p>

                <div className="mt-6 grid gap-4 sm:grid-cols-3">
                  <div className="rounded-xl bg-slate-900 p-5">
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Players</p>
                    <p className="mt-1 text-4xl font-black text-white">{registeredPlayerCount}</p>
                    <p className="mt-1 text-xs text-slate-500">Minimum: {Math.max(1, Number(setupCourtCount)) * 4}</p>
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
                      onChange={(event: ChangeEvent<HTMLInputElement>) => setSetupCourtCount(event.target.value)}
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
                      onChange={(event: ChangeEvent<HTMLInputElement>) => setSetupDurationHours(event.target.value)}
                      className="mt-1 w-full bg-transparent text-4xl font-black text-white outline-none"
                    />
                    <span className="text-xs text-slate-500">Minimum: 1</span>
                  </label>
                </div>

                <div className="mt-5 rounded-xl border border-cyan-500/30 bg-cyan-500/10 p-4 text-sm text-cyan-100">
                  <strong>Rotation:</strong> every court has 4 players. When a court finishes, the next 4 are chosen by fewest games played and longest wait, mixing partners and opponents as much as possible.
                </div>

                <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-xl bg-slate-900 p-4">
                  <input
                    type="checkbox"
                    checked={setupSkillBalance}
                    onChange={(event) =>
                      setSetupSkillBalance(
                        event.target.checked
                      )
                    }
                    className="mt-1 h-5 w-5 accent-cyan-500"
                  />
                  <span>
                    <span className="block font-black text-white">
                      Balance teams by skill
                    </span>
                    <span className="mt-1 block text-sm text-slate-400">
                      Prefer evenly matched teams using player skill levels. Fair turns and partner variety still come first.
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
                    players.length <
                      Math.max(1, Number(setupCourtCount)) * 4
}
                  className="mt-5 w-full rounded-xl bg-emerald-500 px-5 py-4 text-lg font-black text-white hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-500"
                >
                  {startingOpenPlay ? "STARTING OPEN PLAY..." : "START OPEN PLAY"}
                </button>
              </section>
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
              {game.courts.map(
                renderCourt
              )}
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

            <section className="rounded-2xl bg-white p-5 shadow ring-1 ring-slate-200">

              <div className="flex items-center justify-between">

                <div>
                  <p className="text-xs font-black uppercase tracking-widest text-cyan-600">
                    Player Queue
                  </p>

                  <h2 className="text-xl font-black">
                    Registered
                  </h2>

                  {isAdmin && (
  <button
    type="button"
    onClick={() =>
      setShowManagePlayers(true)
    }
    className="mt-3 w-full rounded-xl bg-slate-950 px-4 py-3 text-xs font-black uppercase tracking-wider text-white transition hover:bg-slate-800"
  >
    MANAGE PLAYERS
  </button>
)}

{isAdmin && statsPlayerOptions.length > 0 && (
  <button
    type="button"
    onClick={() =>
      setStatsPlayerId(
        statsPlayerOptions[0].id
      )
    }
    className="mt-3 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-xs font-black uppercase tracking-wider text-slate-700 transition hover:bg-slate-100"
  >
    PLAYER STATS
  </button>
)}

{isAdmin && (
  <a
    href="?view=tv"
    target="_blank"
    rel="noreferrer"
    className="mt-3 block w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-center text-xs font-black uppercase tracking-wider text-slate-700 transition hover:bg-slate-100"
  >
    OPEN TV DISPLAY ↗
  </a>
)}

{isAdmin && (
  <button
    type="button"
    onClick={() =>
      setShowSessionHistory(true)
    }
    className="mt-3 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-xs font-black uppercase tracking-wider text-slate-700 transition hover:bg-slate-100"
  >
    PAST SESSIONS
  </button>
)}

                </div>

                <span className="rounded-full bg-slate-100 px-3 py-2 font-black">
                  {registeredPlayerCount}
                </span>

              </div>

              {/* ===================================== */}
              {/* ON COURT */}
              {/* ===================================== */}

              <div className="mt-5">

                <div className="mb-3 flex items-center justify-between">

                  <p className="text-xs font-black uppercase tracking-widest text-emerald-600">
                    On Court
                  </p>

                  <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-black text-emerald-700">
                    {onCourtPlayers.length}
                  </span>

                </div>

                <div className="space-y-2">

                  {onCourtPlayers.map(
                    (player) => (
                      <div
                        key={player.id}
                        className="flex items-center justify-between rounded-xl bg-slate-800 px-4 py-3"
                      >

                        <div className="flex min-w-0 items-center gap-3">

                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-700 font-black text-white">
                            {player.name
                              .charAt(0)
                              .toUpperCase()}
                          </div>

                          <span className="truncate font-bold text-white">
                            {player.name}
                          </span>

                        </div>

                        <span className="ml-3 shrink-0 rounded-full bg-emerald-500/20 px-2 py-1 text-xs font-black text-emerald-300">
                          PLAYING
                        </span>

                      </div>
                    )
                  )}

                </div>

              </div>

              {/* ===================================== */}
              {/* UP NEXT */}
              {/* ===================================== */}

              <div className="mt-6 border-t border-slate-200 pt-5">

                <div className="mb-3 flex items-center justify-between">

                  <p className="text-xs font-black uppercase tracking-widest text-orange-700">
                    Up Next
                  </p>

                  <span className="rounded-full bg-orange-100 px-2 py-1 text-xs font-black text-orange-700">
                    {upNextPlayers.length}
                  </span>

                </div>

                {upNextPlayers.length ===
                0 ? (
                  <div className="rounded-xl border border-dashed border-slate-300 p-4 text-center text-sm text-slate-500">
                    No players waiting.
                  </div>
                ) : (
                  <div className="space-y-2">

                    {upNextPlayers.map(
                      (
                        player,
                        index
                      ) => (
                        <div
                          key={
                            player.id
                          }
                          className="flex items-center justify-between rounded-xl border border-orange-700 bg-orange-600 px-4 py-3 shadow-sm">

                          <div className="flex min-w-0 items-center gap-3">

                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-orange-900 font-black text-white">
                              {player.name
                                .charAt(
                                  0
                                )
                                .toUpperCase()}
                            </div>

                            <span className="truncate font-bold text-white">
                              {
                                player.name
                              }
                            </span>

                          </div>

                          <span className="ml-3 shrink-0 rounded-full bg-orange-950/60 px-2 py-1 text-xs font-black text-orange-100">
                            NEXT #
                            {index +
                              1}
                          </span>

                        </div>
                      )
                    )}

                  </div>
                )}

              </div>

              {/* ===================================== */}
              {/* WAITING */}
              {/* ===================================== */}

              {laterWaitingPlayers.length >
                0 && (
                <div className="mt-6 border-t border-slate-200 pt-5">

                  <div className="mb-3 flex items-center justify-between">

                    <p className="text-xs font-black uppercase tracking-widest text-slate-500">
                      Waiting
                    </p>

                    <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-black text-slate-600">
                      {
                        laterWaitingPlayers.length
                      }
                    </span>

                  </div>

                  <div className="space-y-2">

                    {laterWaitingPlayers.map(
                      (
                        player,
                        index
                      ) => (
                        <div
                          key={
                            player.id
                          }
                          className="flex items-center justify-between rounded-xl bg-slate-100 px-4 py-3"
                        >

                          <div className="flex min-w-0 items-center gap-3">

                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-300 font-black text-slate-700">
                              {player.name
                                .charAt(
                                  0
                                )
                                .toUpperCase()}
                            </div>

                            <span className="truncate font-bold text-slate-700">
                              {
                                player.name
                              }
                            </span>

                          </div>

                          <span className="ml-3 shrink-0 rounded-full bg-slate-200 px-2 py-1 text-xs font-black text-slate-600">
                            WAIT #
                            {upNextPlayers.length +
                              index +
                              1}
                          </span>

                        </div>
                      )
                    )}

                  </div>

                </div>
              )}

              {onBreakPlayers.length > 0 && (
                <div className="mt-6 border-t border-slate-200 pt-5">
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-xs font-black uppercase tracking-widest text-amber-600">
                      On Break
                    </p>

                    <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-black text-amber-700">
                      {onBreakPlayers.length}
                    </span>
                  </div>

                  <div className="space-y-2">
                    {onBreakPlayers.map((player) => (
                      <div
                        key={player.id}
                        className="flex items-center justify-between rounded-xl bg-amber-50 px-4 py-3"
                      >
                        <span className="truncate font-bold text-amber-900">
                          ☕ {player.name}
                        </span>

                        {isAdmin && (
                          <button
                            type="button"
                            disabled={savingBreakId === player.id}
                            onClick={() =>
                              void handleToggleBreak(
                                player.id,
                                false
                              )
                            }
                            className="ml-3 shrink-0 rounded-lg border border-amber-300 px-3 py-1 text-xs font-black text-amber-700 hover:bg-amber-100 disabled:opacity-50"
                          >
                            BACK IN
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

            </section>

            {/* ======================================= */}
            {/* LIVE RANKING */}
            {/* ======================================= */}

            <section className="rounded-2xl bg-slate-950 p-5 text-white shadow-xl">

              <p className="text-xs font-black uppercase tracking-widest text-emerald-400">
                Live Ranking
              </p>

              <h2 className="text-xl font-black">
                Wins
              </h2>

              <div className="mt-4 space-y-2">

                {rankedPlayers.length ===
                0 ? (
                  <p className="rounded-xl bg-slate-900 p-4 text-sm text-slate-500">
                    Complete a court to
                    start ranking players.
                  </p>
                ) : (
                  rankedPlayers
                    .slice(0, 10)
                    .map(
                      (
                        player,
                        index
                      ) => (
                        <div
                          key={
                            player.playerId
                          }
                          className="flex items-center justify-between rounded-xl bg-slate-900 px-3 py-3"
                        >

                          <div className="flex min-w-0 items-center gap-3">

                            <span className="w-5 text-sm font-black text-cyan-400">
                              {index +
                                1}
                            </span>

                            <span className="truncate font-bold">
                              {
                                player.name
                              }
                            </span>

                          </div>

                          <span className="font-black">
                            {
                              player.wins
                            }
                            W
                          </span>

                        </div>
                      )
                    )
                )}

              </div>

            </section>

            {/* ======================================= */}
            {/* PLAYER STATUS */}
            {/* ======================================= */}

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
                  onClick={() =>
                    void handleToggleBreak(
                      myPlayerId,
                      !isMyPlayerOnBreak
                    )
                  }
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
                    alertsEnabled
                      ? disableAlerts()
                      : void enableAlerts()
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
                  onClick={() =>
                    setStatsPlayerId(myPlayerId)
                  }
                  className="mt-3 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-xs font-black uppercase tracking-wider text-slate-700 transition hover:bg-slate-100"
                >
                  📊 My Stats
                </button>
              )}

            </section>

          </aside>

        </div>

      </main>

{editingCourtNumber !== null && (
  <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/80 p-4">
    <div className="w-full max-w-2xl rounded-2xl bg-white p-6 text-slate-950 shadow-2xl">

      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-widest text-amber-600">
            Admin Override
          </p>

          <h2 className="mt-1 text-2xl font-black">
            Edit Court{" "}
            {editingCourtNumber}
          </h2>

          <p className="mt-2 text-sm text-slate-500">
            Choose the four players and
            manually set the partnerships.
          </p>
        </div>

        <button
          type="button"
          disabled={
            savingAdminLineup
          }
          onClick={
            handleCloseCourtEditor
          }
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

            {[0, 1].map(
              (slotIndex) => (
                <select
                  key={
                    slotIndex
                  }
                  value={
                    adminLineupIds[
                      slotIndex
                    ] ?? ""
                  }
                  onChange={(
                    event
                  ) =>
                    handleAdminLineupChange(
                      slotIndex,
                      event.target.value
                    )
                  }
                  className="w-full rounded-xl border border-cyan-200 bg-white px-4 py-3 font-bold outline-none focus:border-cyan-500"
                >
                  <option value="">
                    Select player
                  </option>

                 {game?.players.map(
  (player) => {
    const status =
      getAdminPlayerStatus(
        player.id
      );

    const alreadySelected =
      adminLineupIds.some(
        (
          selectedId,
          selectedIndex
        ) =>
          selectedId ===
            player.id &&
          selectedIndex !==
            slotIndex
      );

    const disabled =
      status.unavailable ||
      alreadySelected;

    return (
      <option
        key={player.id}
        value={player.id}
        disabled={disabled}
      >
        {player.name}
        {" — "}
        {status.label}
        {alreadySelected
          ? " — SELECTED"
          : ""}
      </option>
    );
  }
)}

                </select>
              )
            )}

          </div>
        </div>

        {/* TEAM B */}
        <div className="rounded-2xl border border-violet-200 bg-violet-50 p-4">
          <p className="text-xs font-black uppercase tracking-widest text-violet-700">
            Team B
          </p>

          <div className="mt-4 space-y-3">

            {[2, 3].map(
              (slotIndex) => (
                <select
                  key={
                    slotIndex
                  }
                  value={
                    adminLineupIds[
                      slotIndex
                    ] ?? ""
                  }
                  onChange={(
                    event
                  ) =>
                    handleAdminLineupChange(
                      slotIndex,
                      event.target.value
                    )
                  }
                  className="w-full rounded-xl border border-violet-200 bg-white px-4 py-3 font-bold outline-none focus:border-violet-500"
                >
                  <option value="">
                    Select player
                  </option>

                  {game?.players.map(
                    (player) => (
                      <option
                        key={
                          player.id
                        }
                        value={
                          player.id
                        }
                      >
                        {
                          player.name
                        }
                      </option>
                    )
                  )}
                </select>
              )
            )}

          </div>
        </div>
      </div>

      <div className="mt-6 rounded-xl bg-slate-100 p-4 text-xs leading-5 text-slate-600">
        Player 1 + Player 2 become
        Team A. Player 3 + Player 4
        become Team B. Waiting players
        can be moved onto the court.
        Replaced players return to the
        waiting queue.
      </div>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row">

        <button
          type="button"
          disabled={
            savingAdminLineup
          }
          onClick={
            handleCloseCourtEditor
          }
          className="flex-1 rounded-xl border border-slate-300 px-5 py-3 font-black text-slate-600 hover:bg-slate-50 disabled:opacity-50"
        >
          CANCEL
        </button>

        <button
          type="button"
          disabled={
            savingAdminLineup
          }
          onClick={() =>
            void handleSaveAdminLineup()
          }
          className="flex-1 rounded-xl bg-amber-500 px-5 py-3 font-black text-slate-950 hover:bg-amber-400 disabled:opacity-50"
        >
          {savingAdminLineup
            ? "SAVING..."
            : "SAVE LINEUP"}
        </button>

      </div>
      </div>
    </div>
)}

{showManagePlayers && game && (
  <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/80 p-4">
    <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white text-slate-950 shadow-2xl">

      {/* HEADER */}
      <div className="flex items-start justify-between border-b border-slate-200 p-6">
        <div>
          <p className="text-xs font-black uppercase tracking-widest text-amber-600">
            Admin
          </p>

          <h2 className="mt-1 text-2xl font-black">
            Manage Players
          </h2>

          <p className="mt-1 text-sm text-slate-500">
            Add guests, set fixed pairs, or
            remove players from this
            open-play session.
          </p>
        </div>

        <button
          type="button"
          onClick={() =>
            setShowManagePlayers(false)
          }
          className="rounded-lg bg-slate-100 px-3 py-2 font-black text-slate-500 hover:bg-slate-200"
        >
          ✕
        </button>
      </div>

      <div className="overflow-y-auto p-6">

        {/* ADD GUEST */}
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">

          <p className="text-xs font-black uppercase tracking-widest text-amber-700">
            + Add Guest Player
          </p>

          <div className="mt-4 grid gap-3 md:grid-cols-[1fr_160px_auto]">

            <input
              type="text"
              value={guestPlayerName}
              onChange={(event) =>
                setGuestPlayerName(
                  event.target.value
                )
              }
              onKeyDown={(event) => {
                if (
                  event.key === "Enter"
                ) {
                  void handleAddGuestPlayer();
                }
              }}
              placeholder="Player name"
              className="rounded-xl border border-amber-200 bg-white px-4 py-3 font-bold outline-none focus:border-amber-500"
            />

            <select
              value={String(
                guestSkillLevel
              )}
              onChange={(event) => {
                const raw =
                  event.target.value;

                setGuestSkillLevel(
                  raw === "5.0+"
                    ? "5.0+"
                    : Number(
                        raw
                      ) as SkillLevel
                );
              }}
              className="rounded-xl border border-amber-200 bg-white px-4 py-3 font-bold outline-none focus:border-amber-500"
            >
              {SKILL_LEVELS.map(
                (level) => (
                  <option
                    key={String(level)}
                    value={String(level)}
                  >
                    {formatSkillLevel(
                      level
                    )}
                  </option>
                )
              )}
            </select>

            <button
              type="button"
              disabled={
                addingGuestPlayer ||
                !guestPlayerName.trim()
              }
              onClick={() =>
                void handleAddGuestPlayer()
              }
              className="rounded-xl bg-amber-500 px-5 py-3 font-black text-slate-950 hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {addingGuestPlayer
                ? "ADDING..."
                : "ADD PLAYER"}
            </button>

          </div>
        </div>

        {/* SKILL BALANCE */}
        <label className="mt-6 flex cursor-pointer items-start gap-3 rounded-2xl border border-cyan-200 bg-cyan-50 p-5">
          <input
            type="checkbox"
            checked={game.skillBalance === true}
            onChange={(event) =>
              void setSkillBalance(
                event.target.checked
              ).catch((error) => {
                console.error(
                  "Unable to update skill balance:",
                  error
                );
                alert(
                  "Unable to update skill balance."
                );
              })
            }
            className="mt-1 h-5 w-5 accent-cyan-600"
          />
          <span>
            <span className="block font-black">
              Balance teams by skill
            </span>
            <span className="mt-1 block text-sm text-slate-500">
              Applies from the next rotation.
            </span>
          </span>
        </label>

        {/* FIXED PAIRS */}
        <div className="mt-6 space-y-4">
          <PairRulesEditor
            kind="fixed"
            players={game.players}
            pairs={game.fixedPairs ?? []}
            description="Paired players always go on court together as teammates, starting with the next rotation."
            onAdd={(a, b) => addSessionPair("fixed", a, b)}
            onRemove={(pair) => removeSessionPair("fixed", pair)}
          />

          <PairRulesEditor
            kind="keepApart"
            players={game.players}
            pairs={game.keepApartPairs ?? []}
            description="These players will never be put on the same team, starting with the next rotation. They can still play against each other."
            onAdd={(a, b) => addSessionPair("keepApart", a, b)}
            onRemove={(pair) => removeSessionPair("keepApart", pair)}
          />
        </div>

        {/* SESSION PLAYERS */}
        <div className="mt-6">

          <div className="flex items-center justify-between">
            <p className="text-xs font-black uppercase tracking-widest text-slate-500">
              Session Players
            </p>

            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black">
              {game.players.length}
            </span>
          </div>

          <div className="mt-3 space-y-2">

            {game.players.map(
              (player) => {
                const status =
                  getSessionPlayerStatus(
                    player.id
                  );

                const isGuest =
                  player.id.startsWith(
                    "guest_"
                  );

                const isPlaying =
                  status.type ===
                  "playing";

                const isRemoving =
                  removingPlayerId ===
                  player.id;

                return (
                  <div
                    key={player.id}
                    className="flex flex-col gap-3 rounded-xl border border-slate-200 p-4 sm:flex-row sm:items-center"
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-3">

                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-900 font-black text-white">
                        {player.name
                          .charAt(0)
                          .toUpperCase()}
                      </div>

                      <div className="min-w-0">
                        <p className="truncate font-black">
                          {player.name}
                        </p>

                        <div className="mt-1 flex flex-wrap gap-2 text-[10px] font-black uppercase">

                          <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-600">
                            {formatSkillLevel(
                              player.skillLevel
                            )}
                          </span>

                          <span
                            className={
                              isGuest
                                ? "rounded-full bg-amber-100 px-2 py-1 text-amber-700"
                                : "rounded-full bg-blue-100 px-2 py-1 text-blue-700"
                            }
                          >
                            {isGuest
                              ? "Guest"
                              : "Account"}
                          </span>

                          <span
                            className={
                              status.type ===
                              "playing"
                                ? "rounded-full bg-emerald-100 px-2 py-1 text-emerald-700"
                                : status.type ===
                                  "next"
                                ? "rounded-full bg-orange-100 px-2 py-1 text-orange-700"
                                : "rounded-full bg-slate-100 px-2 py-1 text-slate-600"
                            }
                          >
                            {status.label}
                          </span>

                          {getFixedPartner(
                            player.id
                          ) && (
                            <span className="rounded-full bg-violet-100 px-2 py-1 text-violet-700">
                              Paired w/{" "}
                              {
                                getFixedPartner(
                                  player.id
                                )?.name
                              }
                            </span>
                          )}

                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col gap-2 sm:items-end">
                      {isGuest && (
                        <>
                          {linkingGuestId ===
                          player.id ? (
                            <div className="flex flex-col gap-2 sm:flex-row">
                              <select
                                value={
                                  selectedLinkAccountId
                                }
                                onChange={(event) =>
                                  setSelectedLinkAccountId(
                                    event.target.value
                                  )
                                }
                                disabled={
                                  savingGuestLink
                                }
                                className="max-w-[240px] rounded-lg border border-blue-200 bg-white px-3 py-2 text-xs font-bold outline-none focus:border-blue-500"
                              >
                                <option value="">
                                  Select registered account
                                </option>

                                {registeredProfiles
                                  .filter(
                                    (profile) =>
                                      !game.players.some(
                                        (sessionPlayer) =>
                                          sessionPlayer.id ===
                                          profile.playerId
                                      )
                                  )
                                  .map(
                                    (profile) => (
                                      <option
                                        key={
                                          profile.playerId
                                        }
                                        value={
                                          profile.playerId
                                        }
                                      >
                                        {profile.name} ·{" "}
                                        {formatSkillLevel(
                                          profile.skillLevel
                                        )}
                                      </option>
                                    )
                                  )}
                              </select>

                              <button
                                type="button"
                                disabled={
                                  savingGuestLink ||
                                  !selectedLinkAccountId
                                }
                                onClick={() =>
                                  void handleLinkGuestPlayer(
                                    player.id
                                  )
                                }
                                className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-black text-white hover:bg-blue-500 disabled:opacity-50"
                              >
                                {savingGuestLink
                                  ? "LINKING..."
                                  : "CONFIRM"}
                              </button>

                              <button
                                type="button"
                                disabled={
                                  savingGuestLink
                                }
                                onClick={() => {
                                  setLinkingGuestId(
                                    null
                                  );
                                  setSelectedLinkAccountId(
                                    ""
                                  );
                                }}
                                className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-black text-slate-500 hover:bg-slate-50"
                              >
                                CANCEL
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                setLinkingGuestId(
                                  player.id
                                );
                                setSelectedLinkAccountId(
                                  ""
                                );
                              }}
                              className="rounded-lg border border-blue-200 px-4 py-2 text-xs font-black text-blue-600 hover:bg-blue-50"
                            >
                              LINK ACCOUNT
                            </button>
                          )}
                        </>
                      )}

                      <button
                        type="button"
                        disabled={
                          savingBreakId === player.id
                        }
                        onClick={() =>
                          void handleToggleBreak(
                            player.id,
                            !onBreakIds.has(player.id)
                          )
                        }
                        className="rounded-lg border border-amber-200 px-4 py-2 text-xs font-black text-amber-700 hover:bg-amber-50 disabled:opacity-50"
                      >
                        {onBreakIds.has(player.id)
                          ? "END BREAK"
                          : "BREAK"}
                      </button>

                      <button
                        type="button"
                        disabled={
                          isPlaying ||
                          isRemoving ||
                          savingGuestLink
                        }
                        onClick={() =>
                          void handleRemoveSessionPlayer(
                            player.id,
                            player.name
                          )
                        }
                        className="rounded-lg border border-red-200 px-4 py-2 text-xs font-black text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-300"
                      >
                        {isPlaying
                          ? "ON COURT"
                          : isRemoving
                          ? "REMOVING..."
                          : "REMOVE"}
                      </button>
                    </div>

                  </div>
                );
              }
            )}

          </div>
        </div>
      </div>

      {/* FOOTER */}

      <div className="border-t border-slate-200 p-4">
        <button
          type="button"
          onClick={() =>
            setShowManagePlayers(false)
          }
          className="w-full rounded-xl bg-slate-950 px-5 py-3 font-black text-white hover:bg-slate-800"
        >
          DONE
        </button>
      </div>

    </div>
  </div>
)}

{showSessionHistory && (
  <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/80 p-4">
    <div className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white text-slate-950 shadow-2xl">

      {/* HEADER */}
      <div className="flex items-start justify-between border-b border-slate-200 p-6">
        <div>
          <p className="text-xs font-black uppercase tracking-widest text-cyan-600">
            Admin
          </p>

          <h2 className="mt-1 text-2xl font-black">
            Past Sessions
          </h2>

          <p className="mt-1 text-sm text-slate-500">
            View completed open-play sessions and results.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setShowSessionHistory(false);
            setSelectedArchivedSession(null);
          }}
          className="rounded-lg bg-slate-100 px-3 py-2 font-black text-slate-500 hover:bg-slate-200"
        >
          ✕
        </button>
      </div>

      {/* CONTENT */}
      <div className="overflow-y-auto p-6">
        {selectedArchivedSession ? (() => {
          const session = selectedArchivedSession;

          const archivedRankedPlayers =
            getRankedPlayers(session);

          const archivedResults =
            session.cycles
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
                    startedAt: court.startedAt,
                    completedAt: court.completedAt,
                  }))
              )
              .sort(
                (a, b) =>
                  (b.completedAt ?? 0) -
                  (a.completedAt ?? 0)
              );

          const archivedDurations =
            archivedResults
              .map((result) => {
                if (
                  !result.startedAt ||
                  !result.completedAt
                ) {
                  return 0;
                }

                return Math.max(
                  0,
                  result.completedAt -
                    result.startedAt
                );
              })
              .filter(
                (duration) =>
                  duration > 0
              );

          const archivedTotalDuration =
            archivedDurations.reduce(
              (total, duration) =>
                total + duration,
              0
            );

          const archivedCycleCount =
            new Set(
              archivedResults.map(
                (result) =>
                  result.cycleNumber
              )
            ).size;

          const archivedAverageDuration =
            archivedDurations.length > 0
              ? archivedTotalDuration /
                archivedDurations.length
              : 0;

          const archivedLongestDuration =
            archivedDurations.length > 0
              ? Math.max(
                  ...archivedDurations
                )
              : 0;

          return (
            <div className="space-y-6">

              <button
                type="button"
                onClick={() =>
                  setSelectedArchivedSession(
                    null
                  )
                }
                className="text-sm font-black text-cyan-600 hover:text-cyan-700"
              >
                ← BACK TO SESSIONS
              </button>

              {/* SESSION HEADER */}
              <div className="rounded-2xl bg-slate-950 p-6 text-white">
                <p className="text-xs font-black uppercase tracking-widest text-cyan-400">
                  Archived Session
                </p>

                <div className="mt-2 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <h3 className="text-2xl font-black sm:text-3xl">
                      {formatSessionDate(
                        session.startedAt
                      )}
                    </h3>

                    <p className="mt-2 text-sm text-slate-400">
                      {session.playerCount} Players ·{" "}
                      {session.courtCount}{" "}
                      {session.courtCount === 1
                        ? "Court"
                        : "Courts"}{" "}
                      · {session.durationHours}{" "}
                      {session.durationHours === 1
                        ? "Hour"
                        : "Hours"}
                    </p>

                    <p className="mt-1 text-sm text-slate-500">
                      {formatSessionTime(
                        session.startedAt
                      )}{" "}
                      –{" "}
                      {formatSessionTime(
                        session.endsAt
                      )}
                    </p>
                  </div>

                  {archivedRankedPlayers[0] && (
                    <div className="rounded-xl bg-amber-400 px-4 py-3 text-slate-950">
                      <p className="text-[10px] font-black uppercase tracking-widest">
                        Session Winner
                      </p>

                      <p className="mt-1 text-lg font-black">
                        🥇{" "}
                        {
                          archivedRankedPlayers[0]
                            .name
                        }
                      </p>
                    </div>
                  )}
                </div>

                {/* SUMMARY CARDS */}
                <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-xl bg-slate-900 p-4">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                      Total Games
                    </p>
                    <p className="mt-1 text-2xl font-black">
                      {archivedResults.length}
                    </p>
                  </div>

                  <div className="rounded-xl bg-slate-900 p-4">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                      Cycles
                    </p>
                    <p className="mt-1 text-2xl font-black">
                      {archivedCycleCount}
                    </p>
                  </div>

                  <div className="rounded-xl bg-slate-900 p-4">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                      Avg Game
                    </p>
                    <p className="mt-1 text-2xl font-black text-cyan-300">
                      {formatDurationMs(
                        archivedAverageDuration
                      )}
                    </p>
                  </div>

                  <div className="rounded-xl bg-slate-900 p-4">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                      Longest Game
                    </p>
                    <p className="mt-1 text-2xl font-black text-emerald-300">
                      {formatDurationMs(
                        archivedLongestDuration
                      )}
                    </p>
                  </div>
                </div>
              </div>

              {/* FINAL RANKING */}
              <div>
                <div className="mb-4">
                  <p className="text-xs font-black uppercase tracking-widest text-cyan-600">
                    Final Ranking
                  </p>

                  <h3 className="text-xl font-black text-slate-950">
                    Performance Breakdown
                  </h3>
                </div>

                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <div className="min-w-[760px]">
                    <div className="grid grid-cols-[48px_1fr_70px_70px_70px_80px_70px_70px_80px] gap-3 bg-slate-950 px-4 py-3 text-xs font-black uppercase tracking-wider text-slate-400">
                      <span>#</span>
                      <span>Player</span>
                      <span>Games</span>
                      <span>Wins</span>
                      <span>Losses</span>
                      <span>Win %</span>
                      <span>PF</span>
                      <span>PA</span>
                      <span>+/-</span>
                    </div>

                    {archivedRankedPlayers.map(
                      (player, index) => {
                        const winRate =
                          player.gamesPlayed > 0
                            ? Math.round(
                                (player.wins /
                                  player.gamesPlayed) *
                                  100
                              )
                            : 0;

                        const pointDiff =
                          player.pointsFor -
                          player.pointsAgainst;

                        return (
                          <div
                            key={`archived-stats-${player.playerId}`}
                            className={`grid grid-cols-[48px_1fr_70px_70px_70px_80px_70px_70px_80px] items-center gap-3 border-t border-slate-200 px-4 py-3 text-sm ${
                              index === 0
                                ? "bg-amber-50"
                                : index === 1
                                  ? "bg-slate-50"
                                  : index === 2
                                    ? "bg-orange-50"
                                    : "bg-white"
                            }`}
                          >
                            <span
                              className={`flex h-8 w-8 items-center justify-center rounded-full font-black ${
                                index === 0
                                  ? "bg-amber-400 text-slate-950"
                                  : index === 1
                                    ? "bg-slate-300 text-slate-950"
                                    : index === 2
                                      ? "bg-orange-500 text-white"
                                      : "text-cyan-600"
                              }`}
                            >
                              {index === 0
                                ? "🥇"
                                : index === 1
                                  ? "🥈"
                                  : index === 2
                                    ? "🥉"
                                    : index + 1}
                            </span>

                            <span className="truncate font-bold text-slate-950">
                              {player.name}
                            </span>

                            <span className="text-slate-600">
                              {player.gamesPlayed}
                            </span>

                            <span className="font-black text-emerald-600">
                              {player.wins}
                            </span>

                            <span className="text-red-500">
                              {player.losses}
                            </span>

                            <span className="font-bold text-slate-950">
                              {winRate}%
                            </span>

                            <span className="text-slate-600">
                              {player.pointsFor}
                            </span>

                            <span className="text-slate-600">
                              {player.pointsAgainst}
                            </span>

                            <span
                              className={`font-black ${
                                pointDiff > 0
                                  ? "text-emerald-600"
                                  : pointDiff < 0
                                    ? "text-red-500"
                                    : "text-slate-400"
                              }`}
                            >
                              {pointDiff > 0
                                ? `+${pointDiff}`
                                : pointDiff}
                            </span>
                          </div>
                        );
                      }
                    )}
                  </div>
                </div>
              </div>

              {/* COMPLETED GAMES */}
              <div>
                <div className="mb-4">
                  <p className="text-xs font-black uppercase tracking-widest text-cyan-600">
                    Results
                  </p>

                  <h3 className="text-xl font-black text-slate-950">
                    Completed Games
                  </h3>
                </div>

                {archivedResults.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
                    No completed games were saved for this session.
                  </div>
                ) : (
                  <div className="grid gap-3 lg:grid-cols-2">
                    {archivedResults.map(
                      (result, index) => {
                        const teamA =
                          result.players.slice(
                            0,
                            2
                          );

                        const teamB =
                          result.players.slice(
                            2,
                            4
                          );

                        const teamAWon =
                          result.scoreA >
                          result.scoreB;

                        const teamBWon =
                          result.scoreB >
                          result.scoreA;

                        return (
                          <div
                            key={`archived-result-${result.cycleNumber}-${result.courtNumber}-${result.completedAt ?? index}`}
                            className="rounded-xl border border-slate-200 bg-slate-50 p-4"
                          >
                            <div className="mb-3 flex items-center justify-between gap-3">
                              <span className="text-[10px] font-black uppercase tracking-widest text-cyan-600">
                                Cycle{" "}
                                {
                                  result.cycleNumber
                                }{" "}
                                • Court{" "}
                                {
                                  result.courtNumber
                                }
                              </span>

                              <div className="text-right">
                                <p className="text-[10px] font-bold text-slate-500">
                                  {formatTime(
                                    result.completedAt
                                  )}
                                </p>

                                <p className="mt-0.5 text-[10px] font-black text-cyan-600">
                                  {formatGameDuration(
                                    result.startedAt,
                                    result.completedAt
                                  )}
                                </p>
                              </div>
                            </div>

                            <div
                              className={`flex items-center justify-between gap-3 rounded-lg px-3 py-3 ${
                                teamAWon
                                  ? "bg-emerald-100"
                                  : "bg-white"
                              }`}
                            >
                              <span
                                className={`min-w-0 truncate text-sm font-black ${
                                  teamAWon
                                    ? "text-emerald-700"
                                    : "text-slate-950"
                                }`}
                              >
                                {teamAWon &&
                                  "🏆 "}
                                {teamA
                                  .map(
                                    (player) =>
                                      player.name
                                  )
                                  .join(
                                    " + "
                                  )}
                              </span>

                              <span className="shrink-0 text-xl font-black text-slate-950">
                                {
                                  result.scoreA
                                }
                              </span>
                            </div>

                            <div className="py-1 text-center text-[9px] font-black text-slate-400">
                              VS
                            </div>

                            <div
                              className={`flex items-center justify-between gap-3 rounded-lg px-3 py-3 ${
                                teamBWon
                                  ? "bg-emerald-100"
                                  : "bg-white"
                              }`}
                            >
                              <span
                                className={`min-w-0 truncate text-sm font-black ${
                                  teamBWon
                                    ? "text-emerald-700"
                                    : "text-slate-950"
                                }`}
                              >
                                {teamBWon &&
                                  "🏆 "}
                                {teamB
                                  .map(
                                    (player) =>
                                      player.name
                                  )
                                  .join(
                                    " + "
                                  )}
                              </span>

                              <span className="shrink-0 text-xl font-black text-slate-950">
                                {
                                  result.scoreB
                                }
                              </span>
                            </div>
                          </div>
                        );
                      }
                    )}
                  </div>
                )}
              </div>

              {/* DELETE */}
              <div className="border-t border-slate-200 pt-5">
                <button
                  type="button"
                  onClick={() =>
                    void handleDeleteArchivedSession(
                      session.sessionId
                    )
                  }
                  className="w-full rounded-xl border border-red-200 bg-red-50 px-5 py-3 font-black text-red-600 hover:bg-red-100"
                >
                  DELETE SESSION
                </button>
              </div>
            </div>
          );
        })() : archivedSessions.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center">
            <p className="font-black text-slate-700">
              No past sessions yet.
            </p>

            <p className="mt-2 text-sm text-slate-500">
              Completed sessions will appear here after starting a new session.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {archivedSessions.map((session) => {
              const totalGames =
                session.cycles.reduce(
                  (total, cycle) =>
                    total +
                    cycle.courts.filter(
                      (court) =>
                        court.status === "completed"
                    ).length,
                  0
                );

              const ranked =
                getRankedPlayers(session);

              const winner =
                ranked[0];

              return (
                <div
                  key={session.sessionId}
                  className="rounded-2xl border border-slate-200 p-5"
                >
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-xs font-black uppercase tracking-widest text-cyan-600">
                        {formatSessionDate(
                          session.startedAt
                        )}
                      </p>

                      <h3 className="mt-1 text-xl font-black">
                        {session.playerCount} Players ·{" "}
                        {session.courtCount}{" "}
                        {session.courtCount === 1
                          ? "Court"
                          : "Courts"}
                      </h3>

                      <p className="mt-1 text-sm text-slate-500">
                        {totalGames} Games ·{" "}
                        {formatSessionTime(
                          session.startedAt
                        )}{" "}
                        –{" "}
                        {formatSessionTime(
                          session.endsAt
                        )}
                      </p>

                      {winner && (
                        <div className="mt-3 inline-flex rounded-full bg-amber-100 px-3 py-1 text-xs font-black text-amber-700">
                          🥇 {winner.name}
                        </div>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        setSelectedArchivedSession(
                          session
                        )
                      }
                      className="rounded-xl bg-slate-950 px-5 py-3 text-sm font-black text-white hover:bg-slate-800"
                    >
                      VIEW SESSION
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* FOOTER */}
      <div className="border-t border-slate-200 p-4">
        <button
          type="button"
          onClick={() => {
            setShowSessionHistory(false);
            setSelectedArchivedSession(null);
          }}
          className="w-full rounded-xl bg-slate-950 px-5 py-3 font-black text-white hover:bg-slate-800"
        >
          DONE
        </button>
      </div>

    </div>
  </div>
)}

    </div>
  );
}

export default App;
