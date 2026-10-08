import { useEffect, useState } from "react";
import { Linking, Pressable, ScrollView, Switch } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { SettingCard } from "@/components/ui/setting-card";
import { ThemedText } from "@/components/ui/themed-text";
import { useAiConsent } from "@/lib/ai-consent";
import { analytics } from "@/lib/analytics";
import { t, useAppLocale } from "@/lib/i18n";
import { LEGAL_URLS } from "@/lib/legal";

function reportSaveFailed() {
  analytics.captureError(
    "ai_consent_save_failed",
    new Error("ai_consent_save_failed"),
  );
}

/**
 * The third-party AI disclosure. It fills the screen and has no close
 * control: the only ways on are its two buttons, which are the same size and
 * weight so declining is as reachable as allowing. It stays up until the
 * server has recorded the answer.
 */
export function AiConsentCard() {
  useAppLocale();
  const { answer } = useAiConsent();
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    analytics.capture("ai_consent_shown");
  }, []);
  const choose = async (granted: boolean) => {
    if (pending) return;
    setPending(true);
    setFailed(false);
    try {
      await answer(granted, "card");
    } catch {
      reportSaveFailed();
      setFailed(true);
    } finally {
      setPending(false);
    }
  };
  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      accessibilityViewIsModal
    >
      <ThemedText variant="sheetTitle" accessibilityRole="header">
        {t("aiConsent.title")}
      </ThemedText>
      <ThemedText style={styles.body}>{t("aiConsent.body")}</ThemedText>
      <ThemedText style={styles.body}>{t("aiConsent.changeLater")}</ThemedText>
      <Pressable
        accessibilityRole="link"
        onPress={() => void Linking.openURL(LEGAL_URLS.privacy)}
        style={styles.linkRow}
      >
        <ThemedText variant="subheadStrong" style={styles.link}>
          {t("legal.privacy")}
        </ThemedText>
      </Pressable>
      {(
        [
          [true, "aiConsent.allow"],
          [false, "common.notNow"],
        ] as const
      ).map(([granted, label]) => (
        <Pressable
          key={label}
          accessibilityRole="button"
          accessibilityState={{ disabled: pending }}
          disabled={pending}
          onPress={() => void choose(granted)}
          style={({ pressed }) => [
            styles.choice,
            granted && styles.choiceFilled,
            (pressed || pending) && styles.dimmed,
          ]}
        >
          <ThemedText
            variant="button"
            style={granted ? styles.onFilled : undefined}
          >
            {t(label)}
          </ThemedText>
        </Pressable>
      ))}
      {failed ? (
        <ThemedText
          variant="caption"
          accessibilityRole="alert"
          style={styles.error}
        >
          {t("refundConsent.error")}
        </ThemedText>
      ) : null}
    </ScrollView>
  );
}

/** The Settings switch for the same answer the card records. */
export function AiConsentSetting() {
  useAppLocale();
  const { theme } = useUnistyles();
  const { status, answer } = useAiConsent();
  // The switch shows the new value while the server records it, and falls
  // back to the recorded one if that fails.
  const [pending, setPending] = useState<boolean | null>(null);
  const toggle = async (granted: boolean) => {
    setPending(granted);
    try {
      await answer(granted, "settings");
    } catch {
      reportSaveFailed();
    } finally {
      setPending(null);
    }
  };
  return (
    <SettingCard
      title={t("aiConsent.setting")}
      description={t("aiConsent.settingHelp")}
      accessory={
        <Switch
          accessibilityLabel={t("aiConsent.setting")}
          value={pending ?? status === "granted"}
          disabled={status === "loading" || pending !== null}
          onValueChange={(value) => void toggle(value)}
          trackColor={{
            false: theme.colors.border,
            true: theme.colors.primary,
          }}
          thumbColor="#fff"
        />
      }
    />
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  screen: { flex: 1, backgroundColor: theme.colors.background },
  content: {
    flexGrow: 1,
    justifyContent: "center",
    padding: theme.gap(3),
    paddingTop: rt.insets.top + theme.gap(3),
    paddingBottom: rt.insets.bottom + theme.gap(3),
    gap: theme.gap(2),
  },
  body: { color: theme.colors.muted },
  linkRow: { minHeight: theme.control.minHeight, justifyContent: "center" },
  link: {
    color: theme.colors.primaryText,
    textDecorationLine: "underline",
  },
  // Both choices share one shape and size. Only the fill differs, and the
  // outlined one keeps full-contrast text, so neither reads as disabled.
  choice: {
    minHeight: theme.control.minHeight,
    padding: theme.gap(1.5),
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.radius.md,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: theme.colors.foreground,
  },
  choiceFilled: { backgroundColor: theme.colors.foreground },
  onFilled: { color: theme.colors.background },
  dimmed: { opacity: theme.opacity.pressed },
  error: { color: theme.colors.danger },
}));
