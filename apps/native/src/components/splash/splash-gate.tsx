import * as Notifications from "expo-notifications";
import { useCallback, useState, useSyncExternalStore } from "react";
import { View } from "react-native";

import { analytics } from "@/lib/analytics";
import { getNotificationUrl } from "@/lib/notifications";
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
// Share Sheet intent, a deep link, or a notification that carries a route.

/**
 * Module scope, deliberately: the splash belongs to the process, not to a
 * component. A Fast Refresh, a route remount, or a re-render of the root
 * layout must not replay it. Set as soon as the animation *starts*, not when
 * it finishes, so a remount mid-animation (the root error boundary's retry
 * remounts the whole route tree) doesn't start it over.
 */
let hasPlayed = false;

/**
 * Whether a tapped notification is about to take the user somewhere.
 * `useNotificationObserver` navigates only on a truthy `url` — so an
 * informational push, or one carrying an empty string, goes nowhere and is not
 * a reason to skip the animation. The truthiness test is what keeps this in
 * step with the observer.
 */
function launchedByNotificationRoute(): boolean {
  try {
    const response = Notifications.getLastNotificationResponse();
    if (!response?.notification) return false;
    return Boolean(getNotificationUrl(response.notification));
  } catch (error) {
    // A missing or unavailable module must never cost us the splash. It does
    // cost the user a 2.5s wait in front of a notification they tapped, so
    // report it rather than degrade quietly.
    analytics.captureError("splash_notification_probe_failed", error);
    return false;
  }
}

/**
 * Owns whether the launch animation is on screen. The root layout also needs
 * the answer, because the status bar follows the splash's ground while it is
 * up, so the decision lives in one hook rather than in the gate's own state.
 */
export function useSplashGate() {
  // Expo Router resolves the initial URL asynchronously, so a share or deep
  // link can land at any point: before this hook first runs, between its
  // render and its commit, or a frame or two into the animation. Reading the
  // flag as an external store covers all three — a subscription set up in an
  // effect would miss anything that arrived before the effect ran, since the
  // store does not replay.
  const directLaunch = useSyncExternalStore(
    subscribeDirectLaunch,
    isDirectLaunch,
  );

  const [wantsSplash] = useState(() => {
    const play =
      !hasPlayed && !isDirectLaunch() && !launchedByNotificationRoute();
    // Either way this process has now had its one chance.
    hasPlayed = true;
    return play;
  });
  const [finished, setFinished] = useState(false);

  const finishSplash = useCallback(() => setFinished(true), []);

  return {
    showSplash: wantsSplash && !finished && !directLaunch,
    finishSplash,
  };
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
