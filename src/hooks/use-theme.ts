import { useCallback, useEffect, useState } from "react";

export type ThemeMode = "light" | "dark" | "system";
const STORAGE_KEY = "ws-theme";

function applyTheme(mode: ThemeMode) {
  const root = document.documentElement;
  const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const isDark = mode === "dark" || (mode === "system" && systemDark);
  root.classList.toggle("dark", isDark);
}

export function getStoredTheme(): ThemeMode {
  if (typeof window === "undefined") return "system";
  const v = window.localStorage.getItem(STORAGE_KEY);
  return v === "light" || v === "dark" || v === "system" ? v : "system";
}

/** Apply stored theme on first paint — call from main.tsx before render. */
export function initTheme() {
  applyTheme(getStoredTheme());
}

export function useTheme() {
  const [theme, setThemeState] = useState<ThemeMode>(getStoredTheme);

  const setTheme = useCallback((mode: ThemeMode) => {
    window.localStorage.setItem(STORAGE_KEY, mode);
    applyTheme(mode);
    setThemeState(mode);
  }, []);

  // React to OS changes when in system mode
  useEffect(() => {
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => applyTheme("system");
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [theme]);

  return { theme, setTheme };
}
