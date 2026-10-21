import { ScreenLoader } from "@/components/ui/screen-loader";
import { ThemedText } from "@/components/ui/themed-text";
import { analytics } from "@/lib/analytics";
import { t, useAppLocale } from "@/lib/i18n";
import { useNotificationSession } from "@/lib/notifications";
import { Alert, Pressable, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StyleSheet } from "react-native-unistyles";

/**
 * Covers the app while the plan is still loading. The screen underneath stays
 * mounted, so a cold-launch deep link keeps its destination; Sign out stays in
 * reach in case the read never resolves.
 */
export function PlanLoadingCover() {
  useAppLocale();
  const { session, operation } = useNotificationSession();

  const signOut = async () => {
    try {
      await session.signOut();
    } catch (error) {
      analytics.captureError("sign_out_failed", error);
      Alert.alert(t("account.signOutFailed"), t("errors.connection"));
    }
  };

  return (
    <View style={styles.cover}>
      <ScreenLoader label={t("loading.app")} />
      <SafeAreaView edges={["bottom"]} style={styles.footer}>
        <Pressable
          accessibilityRole="button"
          onPress={() => void signOut()}
          hitSlop={8}
        >
          <ThemedText variant="caption" style={styles.footerText}>
            {operation === "sign_out"
              ? t("account.signingOut")
              : t("account.signOut")}
          </ThemedText>
        </Pressable>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  cover: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: theme.colors.background,
  },
  footer: { alignItems: "center", paddingBottom: theme.gap(2) },
  footerText: { color: theme.colors.muted },
}));
