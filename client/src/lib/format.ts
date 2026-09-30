// Display helpers shared by the app screens.

export function formatTime(timestamp: number | null) {
  if (!timestamp) return "--";

  return new Date(timestamp).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatGameDuration(
  startedAt: number | null,
  completedAt: number | null
) {
  if (!startedAt || !completedAt) {
    return "--";
  }

  const totalSeconds = Math.max(
    0,
    Math.floor(
      (completedAt - startedAt) / 1000
    )
  );

  const minutes = Math.floor(
    totalSeconds / 60
  );

  const seconds =
    totalSeconds % 60;

  if (minutes >= 60) {
    const hours = Math.floor(
      minutes / 60
    );

    const remainingMinutes =
      minutes % 60;

    return `${hours}h ${remainingMinutes}m`;
  }

  return `${minutes}m ${String(
    seconds
  ).padStart(2, "0")}s`;
}

export function formatDurationMs(
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

export function formatSessionDate(
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

export function formatSessionTime(
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
