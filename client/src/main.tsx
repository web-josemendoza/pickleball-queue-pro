import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import TvDisplay from "./components/TvDisplay";
import ConnectionBanner from "./components/ConnectionBanner";

// ?view=tv shows the read-only venue display.
const isTvView =
  new URLSearchParams(window.location.search).get(
    "view"
  ) === "tv";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ConnectionBanner readOnly={isTvView} />
    {isTvView ? <TvDisplay /> : <App />}
  </StrictMode>
);
