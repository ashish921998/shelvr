import { t, useAppLocale } from "@/lib/i18n";
import { analytics } from "@/lib/analytics";
import {
  notificationPermissionState,
  requestNotificationPermission,
} from "@/lib/notification-token";
import {
  queueWeeklyShelfOptIn,
  saveQueuedWeeklyShelf,
  useNotificationSession,
} from "@/lib/notifications";
import { NotificationPreview } from "@/components/notification-preview";
import { CtaButton, GhostButton } from "@/components/onboarding/parts";
import { HEADLINE_MAX_SCALE } from "@/lib/use-large-text";
import { useConvexAuth } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

/**
 * Says what Shelvr's notifications are for before the OS prompt, right after
 * the first save, when "your saves come back" means something. Shown at once,
 * so a slow permission read never leaves a blank step; it moves on by itself
 * when there is nothing to ask: already allowed, or refused for good.
 */
export function NotificationsStep({ onAdvance }: { onAdvance: () => void }) {
  useAppLocale();
  const { isAuthenticated } = useConvexAuth();
  const { session } = useNotificationSession();
  const [busy, setBusy] = useState(false);
  // The step leaves once: by its own permission read, or by one tap. `busy`
  // lands a render later, so a quick second tap must be stopped here too.
  const done = useRef(false);
  const advanceRef = useRef(onAdvance);
  useEffect(() => {
    advanceRef.current = onAdvance;
  });

  useEffect(() => {
    let live = true;
    notificationPermissionState()
      .then((state) => {
        if (!live || state === "ask" || done.current) return;
        done.current = true;
        advanceRef.current();
      })
      .catch((error: unknown) => {
        analytics.captureError("onboarding_notifications_failed", error);
        if (!live || done.current) return;
        done.current = true;
        advanceRef.current();
      });
    return () => {
      live = false;
    };
  }, []);

  const turnOn = async () => {
    if (done.current) return;
    done.current = true;
    setBusy(true);
    let granted = false;
    try {
      granted = await requestNotificationPermission();
      if (granted) {
        // The weekly shelf is opt-in, and this tap is the opt-in. It is saved
        // in the background so onboarding never waits on the network; signed
        // out or offline, it stays queued until a signed-in session saves it.
        queueWeeklyShelfOptIn();
        if (isAuthenticated)
          saveQueuedWeeklyShelf(session).catch((error: unknown) =>
            analytics.captureError("onboarding_notifications_failed", error),
          );
      }
    } catch (error) {
      analytics.captureError("onboarding_notifications_failed", error);
    } finally {
      analytics.capture("onboarding_notifications", {
        action: "turn_on",
        granted,
      });
      setBusy(false);
      onAdvance();
    }
  };

  const notNow = () => {
    if (done.current) return;
    done.current = true;
    analytics.capture("onboarding_notifications", {
      action: "not_now",
      granted: false,
    });
    onAdvance();
  };

  return (
    <View style={styles.wrap}>
      <Text style={styles.headline} maxFontSizeMultiplier={HEADLINE_MAX_SCALE}>
        {t("onboarding.notifyTitle")}
      </Text>
      <Text style={styles.support}>{t("onboarding.notifyBody")}</Text>

      <NotificationPreview body={t("weekly.previewFallback")} />

      <Text style={styles.note}>{t("onboarding.notifyNote")}</Text>

      <View style={styles.foot}>
        <CtaButton
          label={t("onboarding.notifyAllow")}
          onPress={() => void turnOn()}
          busy={busy}
        />
        <GhostButton
          label={t("common.notNow")}
          onPress={notNow}
          disabled={busy}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  wrap: {
    flex: 1,
    gap: theme.gap(2),
  },
  headline: {
    fontFamily: theme.fonts.display,
    fontSize: 28,
    lineHeight: 34,
    color: theme.colors.foreground,
  },
  support: {
    fontFamily: theme.fonts.regular,
    fontSize: 15,
    lineHeight: 21,
    color: theme.colors.muted,
  },
  note: {
    fontFamily: theme.fonts.regular,
    fontSize: 13,
    lineHeight: 18,
    color: theme.colors.muted,
  },
  foot: {
    marginTop: "auto",
    gap: theme.gap(1),
  },
}));
