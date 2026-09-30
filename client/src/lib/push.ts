/*
 * Registers this device for push alerts (sent by the
 * notifyPlayers Cloud Function) so a player hears about
 * their turn even with the phone locked.
 */

import { ref, remove, set } from "firebase/database";

import app, { db } from "./firebase";

// Public key from Firebase console > Project settings >
// Cloud Messaging > Web Push certificates.
const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY as
  | string
  | undefined;

const USE_EMULATOR =
  import.meta.env.VITE_USE_EMULATOR === "true";

const TOKEN_ID_KEY = "pickleballPushTokenId";

export type PushResult =
  | "enabled"
  | "unsupported"
  | "not-configured"
  | "denied";

export function isIosWithoutInstall(): boolean {
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const installed =
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean })
      .standalone === true;

  return ios && !installed;
}

// Short, stable id for a token so re-enabling on the same
// device overwrites instead of piling up duplicates.
async function tokenId(token: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token)
  );

  return Array.from(new Uint8Array(digest))
    .slice(0, 16)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function saveToken(playerId: string, token: string) {
  const id = await tokenId(token);

  await set(ref(db, `pushTokens/${playerId}/${id}`), {
    token,
    createdAt: Date.now(),
    userAgent: navigator.userAgent.slice(0, 200),
  });

  try {
    localStorage.setItem(TOKEN_ID_KEY, id);
  } catch {
    // Only used to clean up on disable.
  }
}

export async function enablePush(
  playerId: string
): Promise<PushResult> {
  // The emulator can't deliver pushes; store a stand-in
  // token so the Cloud Function path can still be tested.
  if (USE_EMULATOR) {
    await saveToken(playerId, `emulator-${playerId}`);
    return "enabled";
  }

  if (!VAPID_KEY) {
    return "not-configured";
  }

  if (
    !("serviceWorker" in navigator) ||
    !("Notification" in window)
  ) {
    return "unsupported";
  }

  const { getMessaging, getToken, isSupported } =
    await import("firebase/messaging");

  if (!(await isSupported())) {
    return "unsupported";
  }

  const permission = await Notification.requestPermission();

  if (permission !== "granted") {
    return "denied";
  }

  const registration = await navigator.serviceWorker.register(
    "/firebase-messaging-sw.js"
  );

  const token = await getToken(getMessaging(app), {
    vapidKey: VAPID_KEY,
    serviceWorkerRegistration: registration,
  });

  if (!token) {
    return "unsupported";
  }

  await saveToken(playerId, token);
  return "enabled";
}

export async function disablePush(
  playerId: string
): Promise<void> {
  let id: string | null = null;

  try {
    id = localStorage.getItem(TOKEN_ID_KEY);
    localStorage.removeItem(TOKEN_ID_KEY);
  } catch {
    // Nothing stored.
  }

  if (id) {
    await remove(ref(db, `pushTokens/${playerId}/${id}`));
  }

  if (USE_EMULATOR || !VAPID_KEY) {
    return;
  }

  try {
    const { deleteToken, getMessaging, isSupported } =
      await import("firebase/messaging");

    if (await isSupported()) {
      await deleteToken(getMessaging(app));
    }
  } catch {
    // Removing the saved token already stops alerts.
  }
}
