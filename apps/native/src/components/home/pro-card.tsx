import { t, useAppLocale } from "@/lib/i18n";
import { CtaButton } from "@/components/onboarding/parts";
import { openPaywall, readTrialEligible } from "@/lib/entitlement";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

export function ProCard({ lapsed }: { lapsed: boolean }) {
  useAppLocale();
  const router = useRouter();
  const [trialEligible, setTrialEligible] = useState(false);
  useEffect(() => {
    if (lapsed) return;
    let live = true;
    void readTrialEligible().then((eligible) => {
      if (live) setTrialEligible(eligible);
    });
    return () => {
      live = false;
    };
  }, [lapsed]);

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <Text style={styles.title}>
          {t(lapsed ? "pro.unlockShelvr" : "reveal.keepSaving")}
        </Text>
        {!lapsed && trialEligible ? (
          <Text style={styles.body}>{t("reveal.trialNote")}</Text>
        ) : null}
      </View>
      <CtaButton
        label={t("pro.viewPlans")}
        onPress={() =>
          void openPaywall(router, lapsed ? "home_lapsed" : "home_card")
        }
      />
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  card: {
    gap: theme.gap(2),
    padding: theme.gap(2.5),
    borderRadius: theme.radius.lg,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  head: {
    gap: theme.gap(0.5),
  },
  title: {
    fontFamily: theme.fonts.display,
    fontSize: 22,
    color: theme.colors.foreground,
  },
  body: {
    fontFamily: theme.fonts.regular,
    fontSize: 15,
    lineHeight: 21,
    color: theme.colors.muted,
  },
}));
