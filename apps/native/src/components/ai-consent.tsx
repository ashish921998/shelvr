import { useEffect, useState } from "react";
import { Linking, Pressable, ScrollView, Switch, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { GhostButton } from "@/components/onboarding/parts";
import { PinBadge } from "@/components/onboarding/sample-trip-map";
import { Button } from "@/components/ui/button";
import { SettingCard } from "@/components/ui/setting-card";
import { ThemedText } from "@/components/ui/themed-text";
import { useAiConsent } from "@/lib/ai-consent";
import { analytics } from "@/lib/analytics";
import { t, useAppLocale } from "@/lib/i18n";
import { LEGAL_URLS } from "@/lib/legal";
import { ahaSample } from "@/lib/aha-sample";
import { SAMPLE_CITIES } from "@/lib/sample-cities";

function reportSaveFailed() {
  analytics.captureError(
    "ai_consent_save_failed",
    new Error("ai_consent_save_failed"),
  );
}

/** Onboarding's reel example: the places Shelvr found in it, which is what Allow pays for. */
function Hero() {
  const sample = ahaSample("date", null);
  const city = t(SAMPLE_CITIES[sample.city].name);
  return (
    <View
      style={styles.hero}
      accessible
      accessibilityLabel={t("aha.cityPlaces", { city })}
    >
      <ThemedText variant="caption" style={styles.heroCredit}>
        {t("aha.fromReel", { handle: sample.creator })}
      </ThemedText>
      <ThemedText variant="subheadStrong">
        {t("aha.cityPlaces", { city })}
      </ThemedText>
      {sample.spots.map((spot, index) => (
        <View key={spot.name} style={styles.heroSpot}>
          <PinBadge number={index + 1} day={0} />
          <ThemedText>{spot.name}</ThemedText>
        </View>
      ))}
    </View>
  );
}

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
      <ThemedText style={styles.body}>{t("aiConsent.without")}</ThemedText>
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
      <Button
        title={t("aiConsent.allow")}
        loading={pending}
        onPress={() => void choose(true)}
      />
      <GhostButton
        label={t("aiConsent.notNow")}
        disabled={pending}
        onPress={() => void choose(false)}
      />
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

export function AiConsentSetting() {
  useAppLocale();
  const { theme } = useUnistyles();
  const { status, answer } = useAiConsent();
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
  hero: {
    padding: theme.gap(2),
    gap: theme.gap(1),
    borderRadius: theme.radius.lg,
    borderCurve: "continuous",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  heroCredit: { color: theme.colors.primaryText },
  heroSpot: { flexDirection: "row", alignItems: "center", gap: theme.gap(1) },
  title: { marginTop: theme.gap(1) },
  body: { color: theme.colors.muted },
  linkRow: { minHeight: theme.control.minHeight, justifyContent: "center" },
  link: {
    color: theme.colors.primaryText,
    textDecorationLine: "underline",
  },
  error: { color: theme.colors.danger },
}));
