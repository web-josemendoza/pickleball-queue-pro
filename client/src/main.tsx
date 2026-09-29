import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import TvDisplay from "./components/TvDisplay";

// ?view=tv shows the read-only venue display.
const isTvView =
  new URLSearchParams(window.location.search).get(
    "view"
  ) === "tv";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {isTvView ? <TvDisplay /> : <App />}
  </StrictMode>
);
