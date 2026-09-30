import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import ConnectionBanner from "./components/ConnectionBanner";

// The player app loads directly (no extra round trip on
// phones); other screens load their code on demand.
// The entry file is never hot-reloaded, so this rule
// doesn't apply here.
/* eslint-disable react-refresh/only-export-components */
const TvDisplay = lazy(() => import("./components/TvDisplay"));
const TournamentApp = lazy(
  () => import("./components/tournament/TournamentApp")
);
const TournamentTv = lazy(
  () => import("./components/tournament/TournamentTv")
);
/* eslint-enable react-refresh/only-export-components */

// ?view=tv                 open-play venue display
// ?view=tournament         tournament mode
// ?view=tournament-tv      tournament venue display
const view = new URLSearchParams(window.location.search).get("view");
const isTvView = view === "tv" || view === "tournament-tv";

const screen =
  view === "tv" ? (
    <TvDisplay />
  ) : view === "tournament" ? (
    <TournamentApp />
  ) : view === "tournament-tv" ? (
    <TournamentTv />
  ) : (
    <App />
  );

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ConnectionBanner readOnly={isTvView} />
    <Suspense
      fallback={
        <div
          className={`min-h-screen ${
            isTvView ? "bg-slate-950" : "bg-slate-100"
          }`}
        />
      }
    >
      {screen}
    </Suspense>
  </StrictMode>
);
