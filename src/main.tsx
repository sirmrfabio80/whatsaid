import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import "./i18n";
import { initTheme } from "./hooks/use-theme";

initTheme();

createRoot(document.getElementById("root")!).render(<App />);
