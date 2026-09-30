import { analytics } from "@/lib/analytics";
import { formatItemDate } from "@/lib/date";
import { t, useAppLocale } from "@/lib/i18n";
import * as Updates from "expo-updates";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

// Dev clients load JS from Metro, so there is nothing for EAS Update to swap in.
const updatesEnabled = Updates.isEnabled && !__DEV__;

/**
 * Manual EAS Update check. The native side already checks on launch; this lets
 * someone pull an update on their build's channel without cold-starting the
 * app. A found update downloads straight away, then the button offers the
 * restart. Ported from Amber (#16).
 */
export function UpdateSetting() {
  useAppLocale();
  const { theme } = useUnistyles();
  const { currentlyRunning, isChecking, isDownloading, isUpdatePending } =
    Updates.useUpdates();
  const [message, setMessage] = useState<string | null>(null);
  const busy = isChecking || isDownloading;
  const disabled = !updatesEnabled || busy;

  const check = async () => {
    setMessage(null);
    try {
      const result = await Updates.checkForUpdateAsync();
      if (!result.isAvailable) {
        setMessage(t("updates.latest"));
        return;
      }
      const fetched = await Updates.fetchUpdateAsync();
      if (!fetched.isNew && !fetched.isRollBackToEmbedded) {
        setMessage(t("updates.latest"));
      }
    } catch (error) {
      analytics.captureError("update_check_failed", error);
      setMessage(t("updates.checkFailed"));
    }
  };

  const restart = async () => {
    try {
      await Updates.reloadAsync({
        reloadScreenOptions: {
          backgroundColor: theme.colors.background,
          spinner: { color: theme.colors.primary },
        },
      });
    } catch (error) {
      analytics.captureError("update_restart_failed", error);
      setMessage(t("updates.restartFailed"));
    }
  };

  const running = !updatesEnabled
    ? t("updates.development")
    : currentlyRunning.isEmbeddedLaunch || !currentlyRunning.createdAt
      ? t("updates.embedded")
      : t("updates.running", {
          date: formatItemDate(currentlyRunning.createdAt.getTime()),
        });

  const label = isChecking
    ? t("updates.checking")
    : isDownloading
      ? t("updates.downloading")
      : isUpdatePending
        ? t("updates.restart")
        : t("updates.check");

  return (
    <View style={styles.card}>
      <View style={styles.copy}>
        <Text style={styles.title}>{t("updates.title")}</Text>
        <Text style={styles.description}>{running}</Text>
      </View>
      <Pressable
        testID="update-setting"
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled, busy }}
        disabled={disabled}
        onPress={() => void (isUpdatePending ? restart() : check())}
        style={({ pressed }) => [
          styles.button,
          pressed && { opacity: 0.7 },
          disabled && { opacity: 0.4 },
        ]}
      >
        <Text style={styles.buttonText}>{label}</Text>
      </Pressable>
      {isUpdatePending && !busy ? (
        <Text style={styles.description}>{t("updates.ready")}</Text>
      ) : null}
      {message ? (
        <Text accessibilityRole="alert" style={styles.description}>
          {message}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  card: {
    alignSelf: "stretch",
    gap: theme.gap(1),
    padding: theme.gap(1.5),
    borderRadius: theme.radius.md,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  copy: {
    gap: theme.gap(0.25),
  },
  title: {
    fontFamily: theme.fonts.bold,
    fontSize: 15,
    color: theme.colors.foreground,
  },
  description: {
    fontFamily: theme.fonts.regular,
    fontSize: 13,
    lineHeight: 18,
    color: theme.colors.muted,
  },
  button: {
    minHeight: 44,
    justifyContent: "center",
  },
  buttonText: {
    fontFamily: theme.fonts.bold,
    fontSize: 15,
    color: theme.colors.primaryText,
  },
}));
