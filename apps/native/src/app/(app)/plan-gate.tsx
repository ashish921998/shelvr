import { Button } from "@/components/ui/button";
import { ThemedText } from "@/components/ui/themed-text";
import { Wordmark } from "@/components/wordmark";
import { analytics } from "@/lib/analytics";
import { openPaywall } from "@/lib/entitlement";
import { t, useAppLocale } from "@/lib/i18n";
import { LEGAL_URLS } from "@/lib/legal";
import { useNotificationSession } from "@/lib/notifications";
import { useRestorePurchases } from "@/lib/use-restore-purchases";
import { useRouter } from "expo-router";
import { Alert, Linking, Pressable, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StyleSheet } from "react-native-unistyles";

export default function PlanGateScreen() {
  useAppLocale();
  const router = useRouter();
  const { session, operation } = useNotificationSession();
  const { restoring, restore } = useRestorePurchases();

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
      <ScrollView contentContainerStyle={styles.content}>
        <Wordmark size={30} />
        <View style={styles.middle}>
          <ThemedText variant="largeTitle" style={styles.title}>
            {t("planGate.title")}
          </ThemedText>
          <ThemedText variant="body" style={styles.body}>
            {t("planGate.body")}
          </ThemedText>
        </View>
        <Button
          title={t("planGate.seePlans")}
          onPress={() => void openPaywall(router, "plan_gate")}
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
      </ScrollView>
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
  container: { flex: 1, backgroundColor: theme.colors.background },
  content: {
    flexGrow: 1,
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
