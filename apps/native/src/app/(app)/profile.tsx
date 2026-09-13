import { t, useAppLocale } from "@/lib/i18n";
import { FeedbackModal } from "@/components/feedback/feedback-modal";
import { Wordmark } from "@/components/wordmark";
import { HeaderIconButton } from "@/components/ui/header-icon-button";
import { APPEARANCE_LABELS, APPEARANCE_MODES } from "@/lib/appearance";
import { useAppearanceMode } from "@/lib/appearance-runtime";
import {
  openPaywall,
  presentCustomerCenter,
  restorePurchases,
  useEntitlement,
  waitForSheetTransition,
} from "@/lib/entitlement";
import { analytics } from "@/lib/analytics";
import { useCurrentUser } from "@/lib/current-user";
import { LEGAL_URLS, SUPPORT_URL } from "@/lib/legal";
import { useNotificationSession } from "@/lib/notifications";
import { api } from "@convex/_generated/api";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { useMutation } from "convex/react";
import { useRouter } from "expo-router";
import { AppSymbolIcon } from "@/components/symbol";
import { useState } from "react";
import {
  Alert,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Switch,
  Text,
  View,
} from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

export default function ProfileScreen() {
  useAppLocale();
  const { session, operation } = useNotificationSession();
  const deleting = operation === "delete_account";
  const signingOut = operation === "sign_out";
  const busy = operation !== "idle";
  const { data: user } = useCurrentUser();
  const router = useRouter();
  const { theme } = useUnistyles();
  const { status, loading } = useEntitlement();
  const { data: notificationPreferences } = useQuery(
    convexQuery(api.notifications.getPreferences, {}),
  );
  const { data: photoUsage } = useQuery(convexQuery(api.items.photoUsage, {}));
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [resettingFixtures, setResettingFixtures] = useState(false);
  const { mode: appearanceMode, setMode: setAppearanceMode } =
    useAppearanceMode();
  const fixtureResetEnabled =
    __DEV__ && process.env.EXPO_PUBLIC_AUTH_ENABLE_ANONYMOUS === "true";
  const { data: canResetFlowFixtures } = useQuery(
    convexQuery(
      api.devFixtures.canResetCurrentUser,
      fixtureResetEnabled && user ? {} : "skip",
    ),
  );
  const resetFlowFixtures = useMutation(api.devFixtures.resetCurrentUser);

  const closeProfile = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    // A development reload or direct link can restore Profile as the root
    // route. In that state there is no history entry for Android Back to pop.
    router.replace("/");
  };

  const proLabel =
    status === "trialing"
      ? t("Pro — Trial")
      : status === "pro"
        ? "Pro"
        : status === "lifetime"
          ? t("Pro — Lifetime")
          : status === "lapsed"
            ? t("Pro — Lapsed")
            : loading
              ? "…"
              : t("View Pro plans");

  // Customer Center is only relevant to users who have (or had) a subscription
  // — any non-`none` status. A `none` user has nothing to manage and should see
  // the "View Pro plans" paywall row instead.
  const hasSubscription = status !== "none" && !loading;

  // RevenueCat UI (paywall / Customer Center) presents from the root view
  // controller, and UIKit refuses to present while this profile sheet is up
  // ("already presenting RNSScreen"). Dismiss the sheet first, let it settle,
  // then route: an active/lapsed subscriber to Customer Center (cancel/refund/
  // change-plan/restore), a `none` user to the paywall to start a trial.
  const manageSubscription = async () => {
    if (loading) return;
    router.back();
    await waitForSheetTransition();
    if (hasSubscription) {
      const presented = await presentCustomerCenter();
      // Customer Center isn't linked/configured, or identity sync timed out —
      // fall back to the platform's own subscription management page rather
      // than leaving the tap with no visible effect.
      if (!presented) {
        Alert.alert(
          t("Manage subscription"),
          t("Manage your subscription in the App Store."),
          [
            { text: t("Cancel"), style: "cancel" },
            {
              text: t("Open App Store"),
              onPress: () =>
                void Linking.openURL(
                  Platform.OS === "ios"
                    ? "https://apps.apple.com/account/subscriptions"
                    : "https://play.google.com/store/account/subscriptions",
                ),
            },
          ],
        );
      }
    } else {
      void openPaywall(router, "profile");
    }
  };

  const openExternal = (url: string) => {
    void Linking.openURL(url);
  };

  const toggleWeeklyShelf = async (enabled: boolean) => {
    try {
      if ((await session.setWeeklyShelf(enabled)) === false) {
        Alert.alert(
          t("Notifications are off"),
          t(
            "Allow notifications for Shelvr in your device settings to turn on the weekly shelf.",
          ),
        );
      }
    } catch (error) {
      analytics.captureError("weekly_shelf_preference_failed", error);
      Alert.alert(
        t("Couldn’t update notifications"),
        t("Try again in a moment."),
      );
    }
  };

  const handleRestorePurchases = async () => {
    if (restoring) return;
    const storeName = Platform.OS === "ios" ? "App Store" : "Google Play";
    setRestoring(true);
    try {
      const outcome = await restorePurchases();
      if (outcome === "restored") {
        Alert.alert(
          t("Purchases restored"),
          t(
            "Your %{store} purchase was found. Shelvr Pro may take a moment to update.",
            { store: storeName },
          ),
        );
      } else if (outcome === "none") {
        Alert.alert(
          t("No active purchase found"),
          t(
            "No active Shelvr Pro purchase was found for this %{store} account.",
            { store: storeName },
          ),
        );
      } else {
        Alert.alert(
          t("Couldn’t restore purchases"),
          t(
            "Check your connection and try again. You can also manage your plan in %{store}.",
            { store: storeName },
          ),
        );
      }
    } finally {
      setRestoring(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await session.signOut();
    } catch (error) {
      analytics.captureError("sign_out_failed", error);
      Alert.alert(
        t("Couldn’t sign out"),
        t("Check your connection and try again."),
      );
    }
  };

  const confirmDeleteAccount = () => {
    Alert.alert(
      t("Delete account?"),
      [
        t(
          "This permanently deletes your Shelvr account and all of your saves:",
        ),
        t("• Links, notes, and images"),
        t("• Spaces and memberships"),
        t("• Pending uploads and account identity"),
        "",
        t(
          "Deleting your Shelvr account does not cancel an App Store subscription. Manage or cancel Pro in your Apple ID subscription settings if needed.",
        ),
      ].join("\n"),
      [
        { text: t("Cancel"), style: "cancel" },
        {
          text: t("Delete account"),
          style: "destructive",
          onPress: () => {
            void (async () => {
              try {
                await session.deleteAccount();
              } catch (err) {
                analytics.captureError("account_deletion_failed", err);
                Alert.alert(
                  t("Couldn’t delete account"),
                  t(
                    "Something went wrong. Check your connection and try again, or email support@shelvr.app.",
                  ),
                );
              }
            })();
          },
        },
      ],
    );
  };

  const confirmResetFlowFixtures = () => {
    Alert.alert(
      t("Reset flow fixtures?"),
      t(
        "This replaces this anonymous development account’s saves and spaces with deterministic flow data.",
      ),
      [
        { text: t("Cancel"), style: "cancel" },
        {
          text: t("Reset"),
          style: "destructive",
          onPress: () => {
            void (async () => {
              if (resettingFixtures) return;
              setResettingFixtures(true);
              try {
                const result = await resetFlowFixtures({});
                Alert.alert(
                  t("Flow fixtures ready"),
                  `${result.items} saves and ${result.spaces} spaces were created.`,
                );
              } catch (error) {
                analytics.captureError("flow_fixture_reset_failed", error);
                Alert.alert(
                  t("Couldn’t reset fixtures"),
                  t(
                    "Use an anonymous account on a development deployment and try again.",
                  ),
                );
              } finally {
                setResettingFixtures(false);
              }
            })();
          },
        },
      ],
    );
  };

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.content}
    >
      {process.env.EXPO_OS === "android" ? (
        <View style={styles.sheetHeader}>
          <Wordmark size={30} />
          <HeaderIconButton
            icon="xmark"
            label={t("Close profile")}
            onPress={closeProfile}
          />
        </View>
      ) : (
        <Wordmark size={30} />
      )}
      <Text style={styles.slogan}>{t("Save it for later.")}</Text>

      <View style={styles.card}>
        <View style={styles.avatar}>
          <AppSymbolIcon
            name="person.fill"
            size={20}
            tintColor={theme.colors.primaryText}
          />
        </View>
        <Text selectable style={styles.email} numberOfLines={1}>
          {user?.email ?? t("Signed in")}
        </Text>
      </View>

      {fixtureResetEnabled && canResetFlowFixtures ? (
        <Pressable
          testID="reset-flow-fixtures"
          accessibilityRole="button"
          accessibilityLabel={t("Reset flow fixtures")}
          style={({ pressed }) => [
            styles.fixtureReset,
            pressed && { opacity: 0.7 },
            resettingFixtures && { opacity: 0.4 },
          ]}
          disabled={resettingFixtures}
          onPress={confirmResetFlowFixtures}
        >
          <Text style={styles.fixtureResetText}>
            {resettingFixtures
              ? t("Resetting flow fixtures…")
              : t("Reset flow fixtures")}
          </Text>
        </Pressable>
      ) : null}

      <Pressable
        style={({ pressed }) => [
          styles.proRow,
          pressed && { opacity: 0.7 },
          loading && { opacity: 0.4 },
        ]}
        disabled={loading}
        onPress={manageSubscription}
      >
        <AppSymbolIcon
          name="sparkles"
          size={18}
          tintColor={theme.colors.primaryText}
        />
        <View style={styles.proCopy}>
          <Text style={styles.proLabel}>{proLabel}</Text>
          {photoUsage && hasSubscription && status !== "lapsed" ? (
            <Text style={styles.preferenceDescription}>
              {t("Photos: %{count} / %{limit}", {
                count: photoUsage.count,
                limit: photoUsage.limit,
              })}
            </Text>
          ) : null}
        </View>
        <AppSymbolIcon
          name="chevron.right"
          size={16}
          tintColor={theme.colors.muted}
        />
      </Pressable>

      <View
        style={styles.linkGroup}
        accessibilityLabel={t("Appearance")}
        accessibilityRole="radiogroup"
      >
        {APPEARANCE_MODES.map((mode) => {
          const selected = mode === appearanceMode;
          return (
            <Pressable
              key={mode}
              accessibilityRole="radio"
              accessibilityLabel={t("Appearance: %{appearance}", {
                appearance: t(APPEARANCE_LABELS[mode]),
              })}
              accessibilityState={{ selected }}
              style={({ pressed }) => [
                styles.appearanceRow,
                pressed && { opacity: 0.7 },
              ]}
              onPress={() => setAppearanceMode(mode)}
            >
              <Text style={styles.appearanceLabel}>
                {t(APPEARANCE_LABELS[mode])}
              </Text>
              {selected ? (
                <AppSymbolIcon
                  name="checkmark"
                  size={16}
                  tintColor={theme.colors.primaryText}
                />
              ) : null}
            </Pressable>
          );
        })}
      </View>

      <View style={styles.preferenceRow}>
        <View style={styles.preferenceCopy}>
          <Text style={styles.preferenceLabel}>{t("Weekly shelf")}</Text>
          <Text style={styles.preferenceDescription}>
            {t("A few unopened saves every Sunday")}
          </Text>
        </View>
        <Switch
          accessibilityLabel={t("Weekly shelf notifications")}
          value={notificationPreferences?.weeklyShelfEnabled ?? false}
          disabled={notificationPreferences === undefined || busy}
          onValueChange={(value) => void toggleWeeklyShelf(value)}
          trackColor={{
            false: theme.colors.border,
            true: theme.colors.primary,
          }}
          thumbColor="#fff"
        />
      </View>

      <View style={styles.linkGroup}>
        <Pressable
          style={({ pressed }) => [styles.linkRow, pressed && { opacity: 0.7 }]}
          accessibilityRole="button"
          accessibilityLabel={t("Send feedback")}
          onPress={() => setFeedbackOpen(true)}
        >
          <Text style={styles.linkLabel}>{t("Send feedback")}</Text>
          <AppSymbolIcon
            name="arrow.up.right"
            size={14}
            tintColor={theme.colors.muted}
          />
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.linkRow, pressed && { opacity: 0.7 }]}
          onPress={() => openExternal(SUPPORT_URL)}
        >
          <Text style={styles.linkLabel}>{t("Contact Support")}</Text>
          <AppSymbolIcon
            name="arrow.up.right"
            size={14}
            tintColor={theme.colors.muted}
          />
        </Pressable>
        <Pressable
          style={({ pressed }) => [
            styles.linkRow,
            pressed && { opacity: 0.7 },
            restoring && { opacity: 0.4 },
          ]}
          disabled={restoring}
          onPress={() => void handleRestorePurchases()}
        >
          <Text style={styles.linkLabel}>
            {restoring ? t("Restoring Purchases…") : t("Restore Purchases")}
          </Text>
          <AppSymbolIcon
            name="arrow.clockwise"
            size={14}
            tintColor={theme.colors.muted}
          />
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.linkRow, pressed && { opacity: 0.7 }]}
          onPress={() => openExternal(LEGAL_URLS.terms)}
        >
          <Text style={styles.linkLabel}>{t("Terms of Service")}</Text>
          <AppSymbolIcon
            name="arrow.up.right"
            size={14}
            tintColor={theme.colors.muted}
          />
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.linkRow, pressed && { opacity: 0.7 }]}
          onPress={() => openExternal(LEGAL_URLS.privacy)}
        >
          <Text style={styles.linkLabel}>{t("Privacy Policy")}</Text>
          <AppSymbolIcon
            name="arrow.up.right"
            size={14}
            tintColor={theme.colors.muted}
          />
        </Pressable>
      </View>

      <Pressable
        style={({ pressed }) => [styles.signOut, pressed && { opacity: 0.7 }]}
        disabled={busy}
        onPress={() => void handleSignOut()}
      >
        <Text style={styles.signOutText}>
          {signingOut ? t("Signing out…") : t("Sign out")}
        </Text>
      </Pressable>

      <Pressable
        style={({ pressed }) => [
          styles.deleteAccount,
          pressed && { opacity: 0.7 },
          deleting && { opacity: 0.4 },
        ]}
        disabled={busy}
        onPress={confirmDeleteAccount}
      >
        <Text style={styles.deleteAccountText}>
          {deleting ? t("Deleting…") : t("Delete account")}
        </Text>
      </Pressable>
      {feedbackOpen ? (
        <FeedbackModal
          surface="profile"
          onClose={() => setFeedbackOpen(false)}
        />
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create((theme) => ({
  content: {
    flexGrow: 1,
    padding: theme.gap(3),
    paddingTop: theme.gap(4),
    paddingBottom: theme.gap(4),
    gap: theme.gap(1.5),
    alignItems: "center",
  },
  sheetHeader: {
    width: "100%",
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  slogan: {
    fontFamily: theme.fonts.regular,
    fontSize: 14,
    color: theme.colors.muted,
    marginBottom: theme.gap(1),
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.gap(1.5),
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.gap(1.5),
    alignSelf: "stretch",
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  email: {
    flex: 1,
    fontFamily: theme.fonts.medium,
    fontSize: 15,
    color: theme.colors.foreground,
  },
  proRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.gap(1.25),
    alignSelf: "stretch",
    padding: theme.gap(1.5),
    borderRadius: theme.radius.md,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  preferenceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.gap(1.5),
    alignSelf: "stretch",
    padding: theme.gap(1.5),
    borderRadius: theme.radius.md,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  preferenceCopy: {
    flex: 1,
    gap: theme.gap(0.25),
  },
  preferenceLabel: {
    fontFamily: theme.fonts.bold,
    fontSize: 15,
    color: theme.colors.foreground,
  },
  preferenceDescription: {
    fontFamily: theme.fonts.regular,
    fontSize: 13,
    lineHeight: 18,
    color: theme.colors.muted,
  },
  proCopy: {
    flex: 1,
  },
  proLabel: {
    fontFamily: theme.fonts.bold,
    fontSize: 15,
    color: theme.colors.foreground,
  },
  fixtureReset: {
    alignSelf: "stretch",
    alignItems: "center",
    paddingVertical: theme.gap(1.5),
    borderRadius: theme.radius.md,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  fixtureResetText: {
    fontFamily: theme.fonts.bold,
    fontSize: 15,
    color: theme.colors.primary,
  },
  linkGroup: {
    alignSelf: "stretch",
    borderRadius: theme.radius.md,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    overflow: "hidden",
  },
  linkRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: theme.gap(1.5),
    paddingHorizontal: theme.gap(1.5),
  },
  appearanceRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 44,
    paddingVertical: theme.gap(1),
    paddingHorizontal: theme.gap(1.5),
  },
  appearanceLabel: {
    fontFamily: theme.fonts.medium,
    fontSize: 15,
    color: theme.colors.foreground,
  },
  linkLabel: {
    fontFamily: theme.fonts.medium,
    fontSize: 15,
    color: theme.colors.foreground,
  },
  signOut: {
    alignSelf: "stretch",
    alignItems: "center",
    paddingVertical: theme.gap(1.5),
    borderRadius: theme.radius.md,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  signOutText: {
    fontFamily: theme.fonts.bold,
    fontSize: 15,
    color: theme.colors.danger,
  },
  deleteAccount: {
    alignSelf: "stretch",
    alignItems: "center",
    paddingVertical: theme.gap(1.25),
  },
  deleteAccountText: {
    fontFamily: theme.fonts.medium,
    fontSize: 14,
    color: theme.colors.muted,
  },
}));
