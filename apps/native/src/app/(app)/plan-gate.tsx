import { ExitOfferCard } from "@/components/home/exit-offer-card";
import { Button } from "@/components/ui/button";
import { ThemedText } from "@/components/ui/themed-text";
import { Wordmark } from "@/components/wordmark";
import { analytics } from "@/lib/analytics";
import { useCurrentUser } from "@/lib/current-user";
import {
  openPaywallKeepingExitOffer,
  useExitOfferEndsAt,
} from "@/lib/entitlement";
import { t, useAppLocale } from "@/lib/i18n";
import { LEGAL_URLS } from "@/lib/legal";
import { useNotificationSession } from "@/lib/notifications";
import { notePurchaseLanding } from "@/lib/replay-onboarding";
import { useRestorePurchases } from "@/lib/use-restore-purchases";
import { useRouter } from "expo-router";
import { Alert, Linking, Pressable, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StyleSheet } from "react-native-unistyles";

/**
 * No entry without a plan. A signed-in account without an active entitlement
 * lands here instead of the app (the guard is in `(app)/_layout.tsx`), and
 * closing the paywall comes back here. Restore, sign out and Settings, where
 * account deletion lives, stay one tap away: App Review requires them.
 */
export default function PlanGateScreen() {
  useAppLocale();
  const router = useRouter();
  const { session, operation } = useNotificationSession();
  const { restoring, restore } = useRestorePurchases(notePurchaseLanding);
  const { data: user } = useCurrentUser();
  // Home is out of reach here, so an open exit offer, and its reminder
  // switch, lives on the gate for its 24 hours.
  const exitOfferEndsAt = useExitOfferEndsAt(user?._id);

  // A purchase lifts the gate before its webhook lands (see the layout guard).
  // While an exit offer is open, its discount opens instead of full price.
  const seePlans = async () => {
    const outcome = await openPaywallKeepingExitOffer(
      router,
      "plan_gate",
      true,
    );
    if (outcome === "success") notePurchaseLanding();
  };

  const signOut = async () => {
    try {
      await session.signOut();
    } catch (error) {
      analytics.captureError("sign_out_failed", error);
      Alert.alert(t("account.signOutFailed"), t("errors.connection"));
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <Wordmark size={30} />
      <View style={styles.middle}>
        <ThemedText variant="largeTitle" style={styles.title}>
          {t("planGate.title")}
        </ThemedText>
        <ThemedText variant="body" style={styles.body}>
          {t("planGate.body")}
        </ThemedText>
        {exitOfferEndsAt !== null ? (
          <View style={styles.offer}>
            <ExitOfferCard
              endsAt={exitOfferEndsAt}
              userId={user?._id}
              onPurchased={notePurchaseLanding}
            />
          </View>
        ) : null}
      </View>
      <Button
        title={t("planGate.seePlans")}
        onPress={() => void seePlans()}
        style={styles.button}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: restoring, busy: restoring }}
        disabled={restoring}
        onPress={() => void restore()}
        style={styles.restore}
      >
        <ThemedText variant="subheadLabel" style={styles.link}>
          {restoring ? t("pro.restoring") : t("pro.restore")}
        </ThemedText>
      </Pressable>
      <View style={styles.footer}>
        <FooterLink
          label={
            operation === "sign_out"
              ? t("account.signingOut")
              : t("account.signOut")
          }
          onPress={() => void signOut()}
        />
        <FooterLink
          label={t("profile.settings")}
          onPress={() => router.push("/(app)/settings")}
        />
        <FooterLink
          label={t("legal.termsShort")}
          onPress={() => void Linking.openURL(LEGAL_URLS.terms)}
        />
        <FooterLink
          label={t("legal.privacyShort")}
          onPress={() => void Linking.openURL(LEGAL_URLS.privacy)}
        />
      </View>
    </SafeAreaView>
  );
}

function FooterLink({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} hitSlop={8}>
      <ThemedText variant="caption" style={styles.footerText}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
    alignItems: "center",
    paddingHorizontal: theme.gap(3),
    paddingTop: theme.gap(4),
    paddingBottom: theme.gap(2),
  },
  middle: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: theme.gap(1.5),
  },
  title: { textAlign: "center" },
  body: { textAlign: "center", color: theme.colors.muted },
  offer: { alignSelf: "stretch", marginTop: theme.gap(2) },
  button: { alignSelf: "stretch" },
  restore: { paddingVertical: theme.gap(1.5) },
  link: { color: theme.colors.primaryText },
  footer: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: theme.gap(2),
    marginTop: theme.gap(1),
  },
  footerText: { color: theme.colors.muted },
}));
