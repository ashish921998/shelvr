import { t, useAppLocale } from "@/lib/i18n";
import { CtaButton } from "@/components/onboarding/parts";
import { openPaywall } from "@/lib/entitlement";
import { useRouter } from "expo-router";
import { Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

/**
 * Shown on Home in place of the save how-to while the user has no Pro. Saving
 * is Pro-only, so teaching someone who closed the paywall to share into
 * Shelvr only leads back to the paywall; this card says so up front and
 * reopens it. A lapsed account has used its trial, so only a first-time
 * subscriber is told about one.
 */
export function ProCard({ lapsed }: { lapsed: boolean }) {
  useAppLocale();
  const router = useRouter();

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <Text style={styles.title}>
          {t(lapsed ? "pro.unlockShelvr" : "reveal.keepSaving")}
        </Text>
        {lapsed ? null : (
          <Text style={styles.body}>{t("reveal.trialNote")}</Text>
        )}
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
