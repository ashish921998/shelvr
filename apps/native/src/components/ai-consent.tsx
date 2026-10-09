import { api } from "@convex/_generated/api";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Linking, Pressable, ScrollView, Switch, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { AiConsentHero, builtInSave } from "@/components/ai-consent-hero";
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

/** The hero plays over one of the person's own saves that the model already
 * titled and tagged: the plainest way to say what the permission is for.
 * While the read is in flight, or when there is none, it plays over a
 * built-in example instead. */
function Hero() {
  const { data } = useQuery(
    convexQuery(api.items.listItemsPage, {
      paginationOpts: { numItems: 10, cursor: null },
    }),
  );
  const save = data?.page.find(
    (item): item is typeof item & { title: string } =>
      item.status === "ready" && !!item.title && item.tags.length > 0,
  );
  // The hero draws its first frame once, so it waits for the read rather
  // than restarting when the person's own save arrives.
  if (data === undefined) return <View style={styles.heroHold} />;
  return (
    <AiConsentHero
      save={save ?? builtInSave()}
      own={save !== undefined}
      key={save === undefined ? "built-in" : "own"}
    />
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
      <Hero />
      <ThemedText
        variant="sheetTitle"
        accessibilityRole="header"
        style={styles.title}
      >
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
          [false, "aiConsent.turnOff"],
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
  // Roughly the hero's resting height, so the page does not jump when the
  // read lands.
  heroHold: { height: 184 },
  title: { marginTop: theme.gap(1) },
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
