import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import interVariableUrl from "./assets/fonts/InterVariable.woff2?url";
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
  const RELOAD_KEY = "__ws_chunk_reload_at";
  const RELOAD_COOLDOWN_MS = 10_000;

  const isChunkLoadError = (msg: unknown): boolean => {
    if (typeof msg !== "string") return false;
    return (
      msg.includes("Importing a module script failed") ||
      msg.includes("Failed to fetch dynamically imported module") ||
      msg.includes("error loading dynamically imported module") ||
      /ChunkLoadError/i.test(msg)
    );
  };

  const tryReload = (msg: unknown) => {
    if (!isChunkLoadError(msg)) return;
    const last = Number(sessionStorage.getItem(RELOAD_KEY) || "0");
    if (Date.now() - last < RELOAD_COOLDOWN_MS) return;
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
    window.location.reload();
  };

  window.addEventListener("error", (e) => tryReload(e.message));
  window.addEventListener("unhandledrejection", (e) =>
    tryReload((e.reason as Error)?.message ?? e.reason),
  );
}

createRoot(document.getElementById("root")!).render(<App />);
