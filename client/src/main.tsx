import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import ConnectionBanner from "./components/ConnectionBanner";

// The player app loads directly (no extra round trip on
// phones); the single venue TV loads its screen on demand.
// The entry file is never hot-reloaded, so this rule
// doesn't apply here.
// eslint-disable-next-line react-refresh/only-export-components
const TvDisplay = lazy(() => import("./components/TvDisplay"));

// ?view=tv shows the read-only venue display.
const isTvView =
  new URLSearchParams(window.location.search).get(
    "view"
  ) === "tv";

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
      {isTvView ? <TvDisplay /> : <App />}
    </Suspense>
  </StrictMode>
);
