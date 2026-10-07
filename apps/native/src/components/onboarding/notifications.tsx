import { t, useAppLocale } from "@/lib/i18n";
import { analytics } from "@/lib/analytics";
import {
  notificationPermissionState,
  requestNotificationPermission,
} from "@/lib/notification-token";
import { useNotificationSession } from "@/lib/notifications";
import { NotificationPreview } from "@/components/notification-preview";
import { CtaButton, GhostButton } from "@/components/onboarding/parts";
import { HEADLINE_MAX_SCALE } from "@/lib/use-large-text";
import type { DemoSaved } from "@/components/onboarding/live-demo";
import { api } from "@convex/_generated/api";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { useConvexAuth } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

/**
 * Says what Shelvr's notifications are for before the OS prompt, right after
 * the first save, when "your saves come back" means something. Skipped when
 * there is nothing to ask: already allowed, or refused for good.
 */
export function NotificationsStep({
  saved,
  onAdvance,
}: {
  saved: DemoSaved | null;
  onAdvance: () => void;
}) {
  useAppLocale();
  const { isAuthenticated } = useConvexAuth();
  const { session } = useNotificationSession();
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const advanceRef = useRef(onAdvance);
  useEffect(() => {
    advanceRef.current = onAdvance;
  });

  useEffect(() => {
    let live = true;
    notificationPermissionState()
      .then((state) => {
        if (!live) return;
        if (state === "ask") setAsking(true);
        else advanceRef.current();
      })
      .catch((error: unknown) => {
        analytics.captureError("onboarding_notifications_failed", error);
        if (live) advanceRef.current();
      });
    return () => {
      live = false;
    };
  }, []);

  const { data: item } = useQuery(
    convexQuery(
      api.items.getItem,
      saved === null || !asking ? "skip" : { id: saved.itemId },
    ),
  );

  const turnOn = async () => {
    setBusy(true);
    let granted = false;
    try {
      granted = await requestNotificationPermission();
      // The weekly shelf is opt-in, and this tap is the opt-in. Signed out,
      // only the permission is kept; the Home nudge can turn it on later.
      if (granted && isAuthenticated) await session.setWeeklyShelf(true);
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
    analytics.capture("onboarding_notifications", {
      action: "not_now",
      granted: false,
    });
    onAdvance();
  };

  if (!asking) return null;

  return (
    <View style={styles.wrap}>
      <Text style={styles.headline} maxFontSizeMultiplier={HEADLINE_MAX_SCALE}>
        {t("onboarding.notifyTitle")}
      </Text>
      <Text style={styles.support}>{t("onboarding.notifyBody")}</Text>

      <NotificationPreview
        body={
          item?.title
            ? t("weekly.previewBody", { title: item.title })
            : t("weekly.previewFallback")
        }
      />

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
