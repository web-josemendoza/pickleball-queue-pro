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
