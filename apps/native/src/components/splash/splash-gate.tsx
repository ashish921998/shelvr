import * as Notifications from "expo-notifications";
import { useCallback, useEffect, useState } from "react";
import { View } from "react-native";

import {
  isDirectLaunch,
  subscribeDirectLaunch,
} from "@/lib/splash/launch-intent";
import { AnimatedSplash } from "./animated-splash";

// Holds the launch animation over the app for one cold start. The app mounts
// and boots underneath it — auth restore, query hydration, the first route —
// so the splash covers real startup work rather than adding a delay in front
// of it, and hands off with a cross-fade to whatever is already there.
//
// It stands down entirely when the launch is heading somewhere specific: a
// Share Sheet intent, a deep link, or a tapped notification.

/**
 * Module scope, deliberately: the splash belongs to the process, not to a
 * component. A Fast Refresh, a route remount, or a re-render of the root
 * layout must not replay it.
 */
let hasPlayed = false;

/**
 * Whether a notification response is waiting to be handled. `useNotification-
 * Observer` reads the same value on mount and navigates from it, so this is
 * exactly the set of launches that are about to go somewhere.
 */
function launchedByNotification(): boolean {
  try {
    return Notifications.getLastNotificationResponse() != null;
  } catch {
    // A missing or unavailable module must never cost us the splash.
    return false;
  }
}

/**
 * Owns whether the launch animation is on screen. The root layout also needs
 * the answer, because the status bar follows the splash's ground while it is
 * up, so the decision lives in one hook rather than in the gate's own state.
 */
export function useSplashGate() {
  const [showSplash, setShowSplash] = useState(() => {
    if (hasPlayed || isDirectLaunch() || launchedByNotification()) {
      // Settle it now: this process has had its one chance to play.
      hasPlayed = true;
      return false;
    }
    return true;
  });

  const finishSplash = useCallback(() => {
    hasPlayed = true;
    setShowSplash(false);
  }, []);

  // Expo Router resolves the initial URL asynchronously, so a share or deep
  // link can land a frame or two after the splash has already started. Drop it
  // the moment that happens rather than making the user wait out the rest.
  useEffect(() => {
    if (!showSplash) return;
    return subscribeDirectLaunch(finishSplash);
  }, [showSplash, finishSplash]);

  return { showSplash, finishSplash };
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
