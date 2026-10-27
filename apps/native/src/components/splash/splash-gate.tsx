import * as Notifications from "expo-notifications";
import { useCallback, useState, useSyncExternalStore } from "react";
import { View } from "react-native";

import { analytics } from "@/lib/analytics";
import { getNotificationUrl } from "@/lib/notifications";
import { hasResumableSharedPayloads } from "@/lib/share/resumable-payloads";
import {
  playedSplashToday,
  recordSplashPlayed,
} from "@/lib/splash/daily-splash";
import {
  isDirectLaunch,
  subscribeDirectLaunch,
} from "@/lib/splash/launch-intent";
import { AnimatedSplash } from "./animated-splash";

let hasPlayed = false;

function launchedByNotificationRoute(): boolean {
  try {
    const response = Notifications.getLastNotificationResponse();
    if (!response?.notification) return false;
    return Boolean(getNotificationUrl(response.notification));
  } catch (error) {
    analytics.captureError("splash_notification_probe_failed", error);
    return false;
  }
}

export function useSplashGate() {
  const directLaunch = useSyncExternalStore(
    subscribeDirectLaunch,
    isDirectLaunch,
  );

  const [wantsSplash] = useState(() => {
    const play =
      !hasPlayed &&
      !isDirectLaunch() &&
      !launchedByNotificationRoute() &&
      !hasResumableSharedPayloads() &&
      !playedSplashToday();
    hasPlayed = true;
    return play;
  });
  const [finished, setFinished] = useState(false);

  const finishSplash = useCallback(() => {
    // Only a splash that played to the end, or was tapped away, uses up the
    // day's showing.
    recordSplashPlayed();
    setFinished(true);
  }, []);

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
