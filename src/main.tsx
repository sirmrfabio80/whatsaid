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

createRoot(document.getElementById("root")!).render(<App />);
