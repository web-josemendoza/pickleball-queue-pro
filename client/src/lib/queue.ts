import {
  ref,
  set,
  remove,
  onValue,
  update,
  serverTimestamp,
} from "firebase/database";

import { db } from "./firebase";

import type { SkillLevel } from "./player";

export interface QueuePlayer {
  id: string;
  name: string;
  joinedAt: number;
  skillLevel: SkillLevel;
}

const queueRef = ref(db, "queue");

// ==================================================
// SUBSCRIBE
// ==================================================

export function subscribeToQueue(
  callback: (players: QueuePlayer[]) => void
) {
  return onValue(queueRef, (snapshot) => {
    const data = snapshot.val();

    if (!data) {
      callback([]);
      return;
    }

    const players: QueuePlayer[] =
      Object.entries(data).map(
        ([id, player]) => ({
          id,
          ...(player as Omit<
            QueuePlayer,
            "id"
          >),
        })
      );

    players.sort(
      (a, b) =>
        a.joinedAt - b.joinedAt
    );

    callback(players);
  });
}

// ==================================================
// JOIN QUEUE
// ==================================================

export function joinQueue(
  player: {
    playerId: string;
    name: string;
    skillLevel: SkillLevel;
  }
) {
  const playerRef = ref(
    db,
    `queue/${player.playerId}`
  );

  return set(playerRef, {
    name: player.name,
    skillLevel: player.skillLevel,
    joinedAt: serverTimestamp(),
  });
}

// ==================================================
// LEAVE QUEUE
// ==================================================

export function leaveQueue(
  playerId: string
) {
  return remove(
    ref(db, `queue/${playerId}`)
  );
}

// ==================================================
// REMOVE PLAYERS FROM QUEUE
// ==================================================

export function removePlayersFromQueue(
  playerIds: string[]
) {
  const updates: Record<
    string,
    unknown
  > = {};

  for (const playerId of playerIds) {
    updates[
      `queue/${playerId}`
    ] = null;
  }

  return update(ref(db), updates);
}

// ==================================================
// ROTATE QUEUE
// ==================================================

export function rotateQueue(
  loserIds: string[],
  incomingIds: string[]
) {
  const updates: Record<
    string,
    unknown
  > = {};

  // Remove incoming players
  // from waiting queue.
  for (const playerId of incomingIds) {
    updates[
      `queue/${playerId}`
    ] = null;
  }

  // Move losers to the back.
  const now = Date.now();

  loserIds.forEach(
    (playerId, index) => {
      updates[
        `queue/${playerId}/joinedAt`
      ] = now + index;
    }
  );

  return update(
    ref(db),
    updates
  );
}

// ==================================================
// REPLACE QUEUE PLAYERS
// ==================================================

export function replaceQueuePlayers(
  players: QueuePlayer[]
) {
  const uniquePlayers = Array.from(
    new Map(
      players.map((player) => [
        player.id,
        player,
      ])
    ).values()
  );

  const queueData: Record<
    string,
    {
      name: string;
      skillLevel: SkillLevel;
      joinedAt: number;
    }
  > = {};

  const now = Date.now();

  uniquePlayers.forEach((player, index) => {
    queueData[player.id] = {
      name: player.name,
      skillLevel: player.skillLevel,
      joinedAt: now + index,
    };
  });

  return set(queueRef, queueData);
}
