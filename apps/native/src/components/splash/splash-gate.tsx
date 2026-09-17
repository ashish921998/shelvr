import { View } from "react-native";

import { AnimatedSplash } from "./animated-splash";

// Holds the launch animation over the app for one cold start. The app mounts
// and boots underneath it — auth restore, query hydration, the first route —
// so the splash covers real startup work rather than adding a delay in front
// of it, and hands off with a cross-fade to whatever is already there.

/**
 * Module scope, deliberately: the splash belongs to the process, not to a
 * component. A Fast Refresh, a route remount, or a re-render of the root
 * layout must not replay it.
 */
let hasPlayed = false;

/** Whether this process has already shown the splash. */
export function splashHasPlayed() {
  return hasPlayed;
}

export function markSplashPlayed() {
  hasPlayed = true;
}

export function SplashGate({
  active,
  onFinish,
  children,
}: {
  active: boolean;
  onFinish: () => void;
  children: React.ReactNode;
}) {
  return (
    <View style={{ flex: 1 }}>
      {children}
      {active ? <AnimatedSplash onFinish={onFinish} /> : null}
    </View>
  );
}
