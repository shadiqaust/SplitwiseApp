import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: true,
      retry: 1,
      staleTime: 4_000,
      // Poll every 5s on every query by default so any data updated on another
      // device or by another user becomes visible without manual refresh.
      // Per-query callsites can still override (e.g. set `refetchInterval: false`
      // for static lookups), but the default ensures full coverage.
      refetchInterval: 5_000,
      // Keep polling even when the tab/iframe is not focused so users see
      // updates from other devices without having to click back into the app.
      refetchIntervalInBackground: true,
    },
  },
});
