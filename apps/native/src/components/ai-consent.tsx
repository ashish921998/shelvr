import { api } from "@convex/_generated/api";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Linking, Pressable, ScrollView, Switch, View } from "react-native";
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

const EXAMPLE_TAGS = 3;

/** One of the person's own saves that the model already titled and tagged:
 * the plainest way to say what the permission is for. Nothing renders when
 * there is none, or while the read is in flight or has failed. */
function OwnSaveExample() {
  const { data } = useQuery(
    convexQuery(api.items.listItemsPage, {
      paginationOpts: { numItems: 10, cursor: null },
    }),
  );
  const save = data?.page.find(
    (item) => item.status === "ready" && item.title && item.tags.length > 0,
  );
  if (!save) return null;
  return (
    <View style={styles.example}>
      <ThemedText variant="caption" style={styles.body}>
        {t("aiConsent.example")}
      </ThemedText>
      <ThemedText variant="subheadStrong" numberOfLines={2}>
        {save.title}
      </ThemedText>
      <View style={styles.tags}>
        {save.tags.slice(0, EXAMPLE_TAGS).map((tag) => (
          <View key={tag} style={styles.tag}>
            <ThemedText variant="caption" style={styles.body}>
              {tag}
            </ThemedText>
          </View>
        ))}
      </View>
    </View>
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
      <OwnSaveExample />
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
  body: { color: theme.colors.muted },
  example: {
    gap: theme.gap(1),
    padding: theme.gap(2),
    borderRadius: theme.radius.lg,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: theme.gap(1) },
  tag: {
    paddingHorizontal: theme.gap(1.25),
    paddingVertical: theme.gap(0.5),
    borderRadius: 999,
    backgroundColor: theme.colors.surfaceMuted,
  },
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
