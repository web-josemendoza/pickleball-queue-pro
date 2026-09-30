import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  disablePush,
  enablePush,
  type PushResult,
} from "../lib/push";

const STORAGE_KEY =
  "pickleballAlertsEnabled";

const PUSH_KEY = "pickleballPushEnabled";

function readPush(): boolean {
  try {
    return localStorage.getItem(PUSH_KEY) === "true";
  } catch {
    return false;
  }
}

function writePush(enabled: boolean) {
  try {
    localStorage.setItem(PUSH_KEY, String(enabled));
  } catch {
    // Push still works for this page load.
  }
}

function readEnabled(): boolean {
  try {
    return (
      localStorage.getItem(STORAGE_KEY) ===
      "true"
    );
  } catch {
    return false;
  }
}

function writeEnabled(enabled: boolean) {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      String(enabled)
    );
  } catch {
    // Private mode etc. Alerts still work
    // for this page load.
  }
}

let audioContext: AudioContext | null =
  null;

/*
 * Browsers only allow sound after a user
 * gesture, so the context is created when
 * alerts are switched on.
 */
function getAudioContext() {
  if (!audioContext) {
    const Ctor =
      window.AudioContext ??
      (
        window as unknown as {
          webkitAudioContext?: typeof AudioContext;
        }
      ).webkitAudioContext;

    if (!Ctor) {
      return null;
    }

    audioContext = new Ctor();
  }

  return audioContext;
}

function playChime() {
  const context = getAudioContext();

  if (!context) {
    return;
  }

  void context.resume();

  // Two short rising tones.
  [660, 880].forEach((frequency, index) => {
    const start =
      context.currentTime + index * 0.22;

    const oscillator =
      context.createOscillator();

    const gain = context.createGain();

    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.25, start);
    gain.gain.exponentialRampToValueAtTime(
      0.001,
      start + 0.2
    );

    oscillator
      .connect(gain)
      .connect(context.destination);

    oscillator.start(start);
    oscillator.stop(start + 0.2);
  });
}

export type PlayerAlert = {
  title: string;
  body: string;
};

/*
 * Alerts a player when they move into the
 * up-next group or get put on a court.
 *
 * Changes seen on first load are ignored so
 * refreshing the page does not re-alert.
 */
export function usePlayerAlerts(
  playingCourtNumber: number | null,
  isUpNext: boolean,
  playerId: string | null
) {
  const [enabled, setEnabled] =
    useState(readEnabled);

  // Push alerts reach the phone even when it is locked.
  const [pushResult, setPushResult] =
    useState<PushResult | null>(() =>
      readPush() ? "enabled" : null
    );

  const [activeAlert, setActiveAlert] =
    useState<PlayerAlert | null>(null);

  const previous = useRef<{
    court: number | null;
    upNext: boolean;
  } | null>(null);

  const notify = useCallback(
    (alert: PlayerAlert) => {
      setActiveAlert(alert);

      if (!enabled) {
        return;
      }

      navigator.vibrate?.([
        250, 120, 250,
      ]);

      playChime();

      // With push on, the push itself is the system
      // notification; showing one here would double up.
      if (
        pushResult !== "enabled" &&
        document.hidden &&
        "Notification" in window &&
        Notification.permission ===
          "granted"
      ) {
        new Notification(alert.title, {
          body: alert.body,
          tag: "pickleball-queue",
        });
      }
    },
    [enabled, pushResult]
  );

  useEffect(() => {
    const last = previous.current;

    previous.current = {
      court: playingCourtNumber,
      upNext: isUpNext,
    };

    if (!last) {
      return;
    }

    if (
      playingCourtNumber !== null &&
      playingCourtNumber !== last.court
    ) {
      notify({
        title: `You're on Court ${playingCourtNumber}!`,
        body: "Head to your court now.",
      });
      return;
    }

    if (isUpNext && !last.upNext) {
      notify({
        title: "You're up next",
        body: "Get ready, you'll be called to a court soon.",
      });
    }
  }, [
    playingCourtNumber,
    isUpNext,
    notify,
  ]);

  // Hide the in-app banner after a while.
  useEffect(() => {
    if (!activeAlert) {
      return;
    }

    const timer = window.setTimeout(
      () => setActiveAlert(null),
      10000
    );

    return () =>
      window.clearTimeout(timer);
  }, [activeAlert]);

  const enableAlerts = useCallback(
    async () => {
      // Created inside the click so sound
      // is allowed later.
      void getAudioContext()?.resume();

      if (
        "Notification" in window &&
        Notification.permission ===
          "default"
      ) {
        try {
          await Notification.requestPermission();
        } catch {
          // Sound and vibration still work.
        }
      }

      writeEnabled(true);
      setEnabled(true);

      if (!playerId) {
        return;
      }

      try {
        const result = await enablePush(playerId);
        writePush(result === "enabled");
        setPushResult(result);
      } catch (error) {
        console.error("Unable to enable push alerts:", error);
        setPushResult("unsupported");
      }
    },
    [playerId]
  );

  const disableAlerts = useCallback(() => {
    writeEnabled(false);
    setEnabled(false);
    writePush(false);
    setPushResult(null);

    if (playerId) {
      void disablePush(playerId).catch((error) => {
        console.error("Unable to disable push alerts:", error);
      });
    }
  }, [playerId]);

  return {
    alertsEnabled: enabled,
    pushResult,
    enableAlerts,
    disableAlerts,
    activeAlert,
    dismissAlert: () =>
      setActiveAlert(null),
  };
}
