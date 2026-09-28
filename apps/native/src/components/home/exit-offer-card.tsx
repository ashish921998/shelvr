import { t, useAppLocale } from "@/lib/i18n";
import { CtaButton } from "@/components/onboarding/parts";
import { openExitOffer } from "@/lib/entitlement";
import { formatCountdown } from "@/lib/exit-offer";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

/**
 * Takes the Pro card's place while the exit offer's 24-hour window is open.
 * The countdown is real: at zero the offer is gone (see `exit-offer.ts`).
 */
export function ExitOfferCard({ endsAt }: { endsAt: number }) {
  useAppLocale();
  const router = useRouter();
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, []);

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <Text style={styles.title}>{t("exitOffer.title")}</Text>
        <Text style={styles.countdown}>
          {t("exitOffer.endsIn", { time: formatCountdown(endsAt - now) })}
        </Text>
      </View>
      <CtaButton
        label={t("exitOffer.cta")}
        onPress={() => void openExitOffer(router)}
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
  countdown: {
    fontFamily: theme.fonts.regular,
    fontSize: 15,
    lineHeight: 21,
    color: theme.colors.muted,
    fontVariant: ["tabular-nums"],
  },
}));
