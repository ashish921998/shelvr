import { useSegments } from "expo-router";
import { useEffect } from "react";
import { analytics } from "@/lib/analytics";

export function PostHogScreenTracking() {
  // Route segments retain placeholders such as [id], excluding saved item IDs,
  // URLs and OAuth query parameters from the analytics screen name.
  const route = useSegments().join("/");
  // Preserve historical screen names after these tools move out of the tabs.
  const screen =
    route === "(app)/tidy"
      ? "(app)/(tabs)/(tidy)"
      : route === "(app)/map"
        ? "(app)/(tabs)/(map)"
        : route || "index";
  useEffect(() => {
    analytics.screen(screen);
  }, [screen]);
  return null;
}
