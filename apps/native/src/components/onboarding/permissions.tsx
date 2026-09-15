import { t, useAppLocale } from "@/lib/i18n";
import { CtaButton } from "@/components/onboarding/parts";
import { AppSymbolIcon } from "@/components/symbol";
import { analytics } from "@/lib/analytics";
import { requestNotificationPermission } from "@/lib/notifications";
import { setPendingWeeklyShelfOptIn } from "@/lib/pending-notification-preference";
import { useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

// Step 7 — offer a weekly-shelf notification after explaining its value. The
// OS prompt is requested only from the primary CTA. Camera and photo-library
// access remain deferred until the user chooses their matching feature.
export function PermissionsStep({ onAdvance }: { onAdvance: () => void }) {
  useAppLocale();
  const { theme } = useUnistyles();
  const [requesting, setRequesting] = useState(false);

  const finish = (enabled: boolean) => {
    setPendingWeeklyShelfOptIn(enabled);
    analytics.capture("onboarding_notification_choice", { enabled });
    onAdvance();
  };

  const enableNotifications = async () => {
    if (requesting) return;
    setRequesting(true);
    try {
      if (await requestNotificationPermission()) {
        finish(true);
        return;
      }
      setPendingWeeklyShelfOptIn(false);
      analytics.capture("onboarding_notification_choice", { enabled: false });
      Alert.alert(
        t("notifications.disabledTitle"),
        t("notifications.disabledBody"),
        [{ text: t("common.continue"), onPress: onAdvance }],
      );
    } catch (error) {
      analytics.captureError("notification_permission_request_failed", error);
      Alert.alert(t("notifications.updateFailed"), t("errors.trySoon"));
    } finally {
      setRequesting(false);
    }
  };

  return (
    <View style={styles.wrap}>
      <Animated.Text
        entering={FadeInDown.duration(400)}
        style={styles.headline}
      >
        {t("permissions.title")}
      </Animated.Text>

      <Animated.View
        entering={FadeInDown.delay(120).duration(400)}
        style={styles.list}
      >
        <Text style={styles.hint}>{t("permissions.help")}</Text>
        <View style={styles.row}>
          <AppSymbolIcon
            name="bell"
            size={18}
            tintColor={theme.colors.primaryText}
          />
          <View style={styles.copy}>
            <Text style={styles.label}>{t("notifications.weeklyShelf")}</Text>
            <Text style={styles.detail}>{t("notifications.weeklyHelp")}</Text>
          </View>
        </View>
        <Text style={styles.hint}>{t("permissions.captureHelp")}</Text>
        <View style={styles.row}>
          <AppSymbolIcon
            name="camera"
            size={18}
            tintColor={theme.colors.primaryText}
          />
          <View style={styles.copy}>
            <Text style={styles.label}>{t("capture.camera")}</Text>
            <Text style={styles.detail}>{t("permissions.cameraContext")}</Text>
          </View>
        </View>
        <View style={styles.row}>
          <AppSymbolIcon
            name="photo.on.rectangle"
            size={18}
            tintColor={theme.colors.primaryText}
          />
          <View style={styles.copy}>
            <Text style={styles.label}>{t("permissions.photoLibrary")}</Text>
            <Text style={styles.detail}>{t("permissions.photosContext")}</Text>
          </View>
        </View>
      </Animated.View>

      <View style={styles.footer}>
        <CtaButton
          label={t("permissions.enableNotifications")}
          onPress={() => void enableNotifications()}
          disabled={requesting}
        />
        <Pressable
          accessibilityRole="button"
          disabled={requesting}
          onPress={() => finish(false)}
          style={({ pressed }) => [styles.notNow, pressed && { opacity: 0.7 }]}
        >
          <Text style={styles.notNowLabel}>{t("common.notNow")}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  wrap: {
    flex: 1,
    gap: theme.gap(3),
  },
  headline: {
    fontFamily: theme.fonts.bold,
    fontSize: 26,
    lineHeight: 32,
    letterSpacing: -0.4,
    color: theme.colors.foreground,
  },
  list: {
    gap: theme.gap(1.5),
  },
  hint: {
    fontFamily: theme.fonts.regular,
    fontSize: 13,
    color: theme.colors.faint,
    marginBottom: theme.gap(0.5),
  },
  footer: {
    marginTop: "auto",
    gap: theme.gap(1),
  },
  notNow: {
    alignItems: "center",
    paddingVertical: theme.gap(1),
  },
  notNowLabel: {
    fontFamily: theme.fonts.medium,
    fontSize: 15,
    color: theme.colors.muted,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: theme.gap(1.25),
    padding: theme.gap(1.5),
    borderRadius: theme.radius.md,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  copy: {
    flex: 1,
    gap: 2,
  },
  label: {
    fontFamily: theme.fonts.bold,
    fontSize: 15,
    color: theme.colors.foreground,
  },
  detail: {
    fontFamily: theme.fonts.regular,
    fontSize: 13,
    color: theme.colors.muted,
  },
}));
