import { useCallback, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

export type ViewMode = "card" | "list";

export function useViewMode(
  key: string,
  defaultMode: ViewMode = "list",
): [ViewMode, (mode: ViewMode) => void, boolean] {
  const storageKey = `sw_view_mode_${key}`;
  const [mode, setMode] = useState<ViewMode>(defaultMode);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(storageKey)
      .then((stored) => {
        if (cancelled) return;
        if (stored === "card" || stored === "list") setMode(stored);
        setHydrated(true);
      })
      .catch(() => {
        if (!cancelled) setHydrated(true);
      });
    return () => {
      cancelled = true;
    };
  }, [storageKey]);

  const setViewMode = useCallback(
    (next: ViewMode) => {
      setMode(next);
      AsyncStorage.setItem(storageKey, next).catch(() => {
        // Ignore storage errors.
      });
    },
    [storageKey],
  );

  return [mode, setViewMode, hydrated];
}
