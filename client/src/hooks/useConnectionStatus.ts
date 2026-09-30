import { useEffect, useState } from "react";
import { onValue, ref } from "firebase/database";

import { db } from "../lib/firebase";

export type ConnectionStatus =
  | "connecting"
  | "online"
  | "offline";

// How long a first connection may take before we
// tell the user something is wrong.
const FIRST_CONNECT_GRACE_MS = 5000;

/*
 * Live connection to the Firebase database.
 *
 * While offline, Firebase keeps writes in this page
 * and sends them on reconnect, so the UI should warn
 * people not to close or refresh.
 */
export function useConnectionStatus(): ConnectionStatus {
  const [connected, setConnected] = useState<
    boolean | null
  >(null);

  const [graceOver, setGraceOver] =
    useState(false);

  useEffect(
    () =>
      onValue(
        ref(db, ".info/connected"),
        (snapshot) => {
          setConnected(snapshot.val() === true);
        }
      ),
    []
  );

  useEffect(() => {
    const timer = window.setTimeout(
      () => setGraceOver(true),
      FIRST_CONNECT_GRACE_MS
    );

    return () => window.clearTimeout(timer);
  }, []);

  if (connected) {
    return "online";
  }

  // .info/connected reports false before the first
  // connection too; only call that offline once the
  // grace period has passed.
  return graceOver ? "offline" : "connecting";
}
