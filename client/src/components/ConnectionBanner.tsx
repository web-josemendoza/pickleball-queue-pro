import { useConnectionStatus } from "../hooks/useConnectionStatus";

type ConnectionBannerProps = {
  // The TV display never writes, so it gets a
  // shorter message.
  readOnly?: boolean;
};

export default function ConnectionBanner({
  readOnly = false,
}: ConnectionBannerProps) {
  const status = useConnectionStatus();

  if (status !== "offline") {
    return null;
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="sticky top-0 z-[140] bg-red-600 px-4 py-3 text-center text-sm font-bold text-white shadow-lg"
    >
      <span className="font-black">
        ⚠ No connection.
      </span>{" "}
      {readOnly
        ? "Showing the last known courts until the connection returns."
        : "Scores and changes will be saved when the connection returns. Keep this page open and don't refresh."}
    </div>
  );
}
