import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import interVariableUrl from "./assets/fonts/InterVariable.woff2?url";
import { reloadOnceForChunkError } from "./lib/chunk-recovery";
import { installUserActionTracker } from "./lib/chunk-diagnostics";
import { installFrameDiagnostics } from "./lib/frame-diagnostics";
import "./index.css";
import "./i18n";

// Preload the most-used font (Inter variable) so it starts downloading
// before CSS is parsed and font-face rules are discovered.
if (typeof document !== "undefined") {
  const link = document.createElement("link");
  link.rel = "preload";
  link.as = "font";
  link.type = "font/woff2";
  link.crossOrigin = "anonymous";
  link.href = interVariableUrl;
  document.head.appendChild(link);
}

// Auto-recover from stale dynamic-import chunks after a redeploy.
// When a user has an old index.js cached and we ship a new build, lazy()
// imports try to fetch a chunk hash that no longer exists. Reload once.
if (typeof window !== "undefined") {
  installUserActionTracker();
  installFrameDiagnostics();
  window.addEventListener("error", (e) =>
    reloadOnceForChunkError(e.error ?? e.message, { source: "error", evt: e }),
  );
  window.addEventListener("unhandledrejection", (e) =>
    reloadOnceForChunkError(e.reason, { source: "unhandledrejection" }),
  );
}

createRoot(document.getElementById("root")!).render(<App />);
