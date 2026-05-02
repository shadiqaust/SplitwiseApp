import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: true,
      retry: 1,
      staleTime: 4_000,
      // Keep polling even when the tab/iframe is not focused so users see
      // updates from other devices without having to click back into the app.
      refetchIntervalInBackground: true,
    },
  },
});
