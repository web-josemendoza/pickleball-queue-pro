import { initializeApp } from "firebase-admin/app";
import type { Reference } from "firebase-admin/database";
import { getMessaging } from "firebase-admin/messaging";
import { onValueWritten } from "firebase-functions/v2/database";
import * as logger from "firebase-functions/logger";

import {
  findAlerts,
  findTournamentAlerts,
  type PlayerAlert,
  type SessionSnapshot,
  type TournamentSnapshot,
} from "./alerts.js";

initializeApp();

// Push delivery can't be emulated: locally we log instead.
const isEmulator = process.env.FUNCTIONS_EMULATOR === "true";

// Tokens FCM reports as dead; they are deleted.
const DEAD_TOKEN_ERRORS = new Set([
  "messaging/registration-token-not-registered",
  "messaging/invalid-registration-token",
  "messaging/invalid-argument",
]);

type StoredToken = { token: string };

async function sendAlert(
  root: Reference,
  alert: PlayerAlert
): Promise<void> {
  const ref = root.child(`pushTokens/${alert.playerId}`);
  const saved = ((await ref.get()).val() ?? {}) as Record<string, StoredToken>;
  const entries = Object.entries(saved).filter(([, value]) => value?.token);

  if (entries.length === 0) {
    return;
  }

  if (isEmulator) {
    logger.info("push (emulator, not sent)", {
      playerId: alert.playerId,
      title: alert.title,
      devices: entries.length,
    });
    return;
  }

  const response = await getMessaging().sendEachForMulticast({
    tokens: entries.map(([, value]) => value.token),
    webpush: {
      notification: {
        title: alert.title,
        body: alert.body,
        icon: "/icons/icon-192.png",
        badge: "/icons/icon-192.png",
        // One alert per kind: a newer one replaces the old.
        tag: `pickleball-${alert.kind}`,
        renotify: true,
      },
      fcmOptions: { link: "/" },
    },
  });

  const dead: Record<string, null> = {};

  response.responses.forEach((result, index) => {
    const code = result.error?.code;

    if (code && DEAD_TOKEN_ERRORS.has(code)) {
      dead[entries[index][0]] = null;
    } else if (code) {
      logger.warn("push failed", { playerId: alert.playerId, code });
    }
  });

  if (Object.keys(dead).length > 0) {
    await ref.update(dead);
  }
}

/*
 * Whenever the session changes, tell players who just
 * moved into "up next" or onto a court.
 */
export const notifyPlayers = onValueWritten(
  {
    ref: "/openPlay/game",
    instance: "pickleball-queue-pro-default-rtdb",
    // Must match the database's region. The local database
    // emulator always reports us-central1.
    region: isEmulator ? "us-central1" : "asia-southeast1",
  },
  async (event) => {
    const alerts = findAlerts(
      event.data.before.val() as SessionSnapshot,
      event.data.after.val() as SessionSnapshot
    );

    if (alerts.length === 0) {
      return;
    }

    // Read devices from the same database that changed.
    const root = event.data.after.ref.root;

    const results = await Promise.allSettled(
      alerts.map((alert) => sendAlert(root, alert))
    );

    results.forEach((result, index) => {
      if (result.status === "rejected") {
        logger.error("alert failed", {
          playerId: alerts[index].playerId,
          error: String(result.reason),
        });
      }
    });
  }
);

/*
 * When a tournament match is called to a court, tell the
 * registered players on both teams.
 */
export const notifyTournamentPlayers = onValueWritten(
  {
    ref: "/tournament/current",
    instance: "pickleball-queue-pro-default-rtdb",
    region: isEmulator ? "us-central1" : "asia-southeast1",
  },
  async (event) => {
    const alerts = findTournamentAlerts(
      event.data.before.val() as TournamentSnapshot,
      event.data.after.val() as TournamentSnapshot
    );

    if (alerts.length === 0) {
      return;
    }

    const root = event.data.after.ref.root;

    const results = await Promise.allSettled(
      alerts.map((alert) => sendAlert(root, alert))
    );

    results.forEach((result, index) => {
      if (result.status === "rejected") {
        logger.error("tournament alert failed", {
          playerId: alerts[index].playerId,
          error: String(result.reason),
        });
      }
    });
  }
);
