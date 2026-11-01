import { NotificationPreview } from "@/components/notification-preview";
import { GhostButton, PillButton } from "@/components/onboarding/parts";
import type { AhaSample } from "@/lib/aha-sample";
import { analytics } from "@/lib/analytics";
import { formattingLocale, t, useAppLocale } from "@/lib/i18n";
import { requestNotificationPermission } from "@/lib/notification-token";
import { SAMPLE_CITIES } from "@/lib/sample-cities";
import { useEffect, useRef, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

const TRIP_EVE_HOUR = 18;

function tripEveTime(): string {
  return new Intl.DateTimeFormat(formattingLocale(), {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(2026, 0, 1, TRIP_EVE_HOUR));
}

export function NotificationsStep({
  sample,
  leaving,
  onContinue,
}: {
  sample: AhaSample;
  leaving: boolean;
  onContinue: () => void;
}) {
  useAppLocale();
  const [asking, setAsking] = useState(false);
  const inFlight = useRef(false);
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const leave = (action: "allow" | "skip", granted: boolean) => {
    analytics.capture("onboarding_notifications", { action, granted });
    onContinue();
  };

  const allow = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setAsking(true);
    let granted = false;
    try {
      granted = await requestNotificationPermission();
    } catch (error) {
      analytics.captureError("onboarding_notifications_failed", error);
    }
    if (!mounted.current) return;
    inFlight.current = false;
    setAsking(false);
    leave("allow", granted);
  };

  return (
    <View style={styles.wrap}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.head}>
          <Text style={styles.title} accessibilityRole="header">
            {t("onboardingNotify.title")}
          </Text>
          <Text style={styles.sub}>{t("onboardingNotify.sub")}</Text>
        </View>
        <View style={styles.previews}>
          <NotificationPreview
            when={tripEveTime()}
            title={t("reminder.tripEveTitle", {
              city: t(SAMPLE_CITIES[sample.city].name),
            })}
            body={t("reminder.tripEveBody", { count: sample.spots.length })}
          />
          <NotificationPreview
            when={t("onboardingNotify.now")}
            title={t("reminder.visitTitle")}
            body={t("reminder.visitBody", { title: sample.spots[0].name })}
          />
        </View>
      </ScrollView>
      <View style={styles.actions}>
        <PillButton
          label={t("onboardingNotify.allow")}
          onPress={() => void allow()}
          busy={asking || leaving}
        />
        <GhostButton
          label={t("common.notNow")}
          onPress={() => leave("skip", false)}
          disabled={asking || leaving}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  wrap: { flex: 1, gap: theme.gap(1.5) },
  scroll: { flex: 1 },
  body: { gap: theme.gap(3), paddingBottom: theme.gap(1) },
  head: { gap: theme.gap(1) },
  title: { ...theme.type.displayTitle, color: theme.colors.foreground },
  sub: { ...theme.type.body, color: theme.colors.muted },
  previews: { gap: theme.gap(1) },
  actions: { alignItems: "center", gap: theme.gap(1) },
}));
