import { t, useAppLocale } from "@/lib/i18n";
/**
 * Paywall fallback screen. In production, the paywall is presented natively by
 * RevenueCat's `presentPaywall()` SDK (designed in the RevenueCat dashboard).
 * This screen only appears on real unavailability (SDK not linked, identity
 * sync timeout, network/config error) — user cancellation returns to the
 * previous screen without routing here.
 *
 * It deliberately avoids pricing copy because RevenueCat remains the source of
 * truth for current offerings. Restore Purchases is available via the native
 * paywall and Customer Center once the SDK is reachable again.
 */
import { openPaywall, waitForSheetTransition } from "@/lib/entitlement";
import { LEGAL_URLS } from "@/lib/legal";
import { useRouter } from "expo-router";
import { Linking, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StyleSheet } from "react-native-unistyles";
import { InkShelf } from "@/components/ink/ink-shelf";
import { INK_A11Y } from "@/components/ink/ink-canvas";
import { PrimaryButton, TertiaryAction } from "@/components/shelf/ink-button";
import { Display } from "@/components/shelf/typography";
import { useInkClock } from "@/lib/ink/use-ink-clock";

export default function PaywallScreen() {
  useAppLocale();
  const router = useRouter();
  const clock = useInkClock();

  return (
    <SafeAreaView style={styles.container} edges={["bottom", "left", "right"]}>
      <Display style={styles.title}>Shelvr Pro</Display>
      {/* This is a failure, not a pitch: an empty shelf says the same thing
          the words do, and the screen keeps its one drawn accent. */}
      <View style={styles.drawing} {...INK_A11Y}>
        <InkShelf width={220} clock={clock} prop="candle" propAt={0.74} />
      </View>
      <Text style={styles.message}>{t("pro.loadFailed")}</Text>
      <PrimaryButton
        label={t("common.tryAgain")}
        style={styles.action}
        onPress={() => {
          void (async () => {
            router.back();
            // This screen is a formSheet — UIKit refuses to present RC's
            // paywall while the dismissal is still animating, which would
            // map to 'unavailable' and bounce right back here.
            await waitForSheetTransition();
            await openPaywall(router, "retry");
          })();
        }}
      />
      <TertiaryAction
        label={t("common.notNow")}
        onPress={() => router.back()}
      />
      <Text style={styles.legal}>
        <Text
          style={styles.legalLink}
          onPress={() => void Linking.openURL(LEGAL_URLS.terms)}
        >
          {t("legal.termsShort")}
        </Text>
        {" · "}
        <Text
          style={styles.legalLink}
          onPress={() => void Linking.openURL(LEGAL_URLS.privacy)}
        >
          {t("legal.privacyShort")}
        </Text>
      </Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: theme.gap(3),
    paddingVertical: theme.gap(4),
    gap: theme.gap(1.5),
  },
  title: { textAlign: "center" },
  drawing: { marginVertical: theme.gap(0.5) },
  message: {
    fontFamily: theme.fonts.regular,
    fontSize: 15,
    lineHeight: 22,
    color: theme.colors.muted,
    textAlign: "center",
  },
  action: { alignSelf: "stretch", marginTop: theme.gap(1) },
  legal: {
    marginTop: theme.gap(1),
    fontFamily: theme.fonts.regular,
    fontSize: 12,
    color: theme.colors.faint,
  },
  legalLink: {
    fontFamily: theme.fonts.medium,
    color: theme.colors.muted,
    textDecorationLine: "underline",
  },
}));
