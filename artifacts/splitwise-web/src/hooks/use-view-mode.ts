import { useCallback, useEffect, useState } from "react";

export type ViewMode = "card" | "list";

export function useViewMode(key: string, defaultMode: ViewMode = "card"): [ViewMode, (mode: ViewMode) => void] {
  const storageKey = `sw_view_mode_${key}`;
  const [mode, setMode] = useState<ViewMode>(() => {
    if (typeof window === "undefined") return defaultMode;
    try {
      const stored = window.localStorage.getItem(storageKey);
      return stored === "card" || stored === "list" ? stored : defaultMode;
    } catch {
      return defaultMode;
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey, mode);
    } catch {
      // Ignore storage errors (e.g. quota / privacy mode).
    }
  }, [storageKey, mode]);

  const setViewMode = useCallback((next: ViewMode) => {
    setMode(next);
  }, []);

  return [mode, setViewMode];
}
