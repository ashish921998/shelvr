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
import { isAnonymousAuthEnabled } from "@/lib/anonymous-auth";
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
  const fixtureResetEnabled = isAnonymousAuthEnabled();
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
      ? t("pro.trial")
      : status === "pro"
        ? "Pro"
        : status === "lifetime"
          ? t("pro.lifetime")
          : status === "lapsed"
            ? t("pro.lapsed")
            : loading
              ? "…"
              : t("pro.viewPlans");

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
        Alert.alert(t("pro.manage"), t("pro.manageHelp"), [
          { text: t("common.cancel"), style: "cancel" },
          {
            text: t("pro.openStore"),
            onPress: () =>
              void Linking.openURL(
                Platform.OS === "ios"
                  ? "https://apps.apple.com/account/subscriptions"
                  : "https://play.google.com/store/account/subscriptions",
              ),
          },
        ]);
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
          t("notifications.disabledTitle"),
          t("notifications.disabledBody"),
          [
            { text: t("common.cancel"), style: "cancel" },
            {
              text: t("permissions.openSettings"),
              onPress: () => void Linking.openSettings(),
            },
          ],
        );
      }
    } catch (error) {
      analytics.captureError("weekly_shelf_preference_failed", error);
      Alert.alert(t("notifications.updateFailed"), t("errors.trySoon"));
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
          t("pro.restoredTitle"),
          t("pro.restoredBody", { store: storeName }),
        );
      } else if (outcome === "none") {
        Alert.alert(
          t("pro.notFoundTitle"),
          t("pro.notFoundBody", { store: storeName }),
        );
      } else {
        Alert.alert(
          t("pro.restoreFailed"),
          t("pro.restoreFailedBody", { store: storeName }),
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
      Alert.alert(t("account.signOutFailed"), t("errors.connection"));
    }
  };

  const confirmDeleteAccount = () => {
    Alert.alert(
      t("account.deleteTitle"),
      [
        t("account.deleteIntro"),
        t("account.deleteItems"),
        t("account.deleteSpaces"),
        t("account.deleteUploads"),
        "",
        t("account.subscriptionWarning"),
      ].join("\n"),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("account.delete"),
          style: "destructive",
          onPress: () => {
            void (async () => {
              try {
                await session.deleteAccount();
              } catch (err) {
                analytics.captureError("account_deletion_failed", err);
                Alert.alert(
                  t("account.deleteFailed"),
                  t("errors.contactSupport"),
                );
              }
            })();
          },
        },
      ],
    );
  };

  const confirmResetFlowFixtures = () => {
    Alert.alert(t("dev.resetTitle"), t("dev.resetBody"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("dev.reset"),
        style: "destructive",
        onPress: () => {
          void (async () => {
            if (resettingFixtures) return;
            setResettingFixtures(true);
            try {
              const result = await resetFlowFixtures({});
              Alert.alert(
                t("dev.resetSuccess"),
                `${result.items} saves and ${result.spaces} spaces were created.`,
              );
            } catch (error) {
              analytics.captureError("flow_fixture_reset_failed", error);
              Alert.alert(t("dev.resetFailed"), t("dev.resetHelp"));
            } finally {
              setResettingFixtures(false);
            }
          })();
        },
      },
    ]);
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
            label={t("profile.close")}
            onPress={closeProfile}
          />
        </View>
      ) : (
        <Wordmark size={30} />
      )}
      <Text style={styles.slogan}>{t("brand.tagline")}</Text>

      <View style={styles.card}>
        <View style={styles.avatar}>
          <AppSymbolIcon
            name="person.fill"
            size={20}
            tintColor={theme.colors.primaryText}
          />
        </View>
        <Text selectable style={styles.email} numberOfLines={1}>
          {user?.email ?? t("account.signedIn")}
        </Text>
      </View>

      {fixtureResetEnabled && canResetFlowFixtures ? (
        <Pressable
          testID="reset-flow-fixtures"
          accessibilityRole="button"
          accessibilityLabel={t("dev.resetFixtures")}
          style={({ pressed }) => [
            styles.fixtureReset,
            pressed && { opacity: 0.7 },
            resettingFixtures && { opacity: 0.4 },
          ]}
          disabled={resettingFixtures}
          onPress={confirmResetFlowFixtures}
        >
          <Text style={styles.fixtureResetText}>
            {resettingFixtures ? t("dev.resetting") : t("dev.resetFixtures")}
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
              {t("profile.photoUsage", {
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
        accessibilityLabel={t("profile.appearance")}
        accessibilityRole="radiogroup"
      >
        {APPEARANCE_MODES.map((mode) => {
          const selected = mode === appearanceMode;
          return (
            <Pressable
              key={mode}
              accessibilityRole="radio"
              accessibilityLabel={t("profile.appearanceLabel", {
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
          <Text style={styles.preferenceLabel}>
            {t("notifications.weeklyShelf")}
          </Text>
          <Text style={styles.preferenceDescription}>
            {t("notifications.weeklyHelp")}
          </Text>
        </View>
        <Switch
          accessibilityLabel={t("notifications.toggleLabel")}
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
          accessibilityLabel={t("import.fromX")}
          onPress={() => router.push("/import")}
        >
          <Text style={styles.linkLabel}>{t("import.fromX")}</Text>
          <AppSymbolIcon
            name="chevron.right"
            size={16}
            tintColor={theme.colors.muted}
          />
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.linkRow, pressed && { opacity: 0.7 }]}
          accessibilityRole="button"
          accessibilityLabel={t("feedback.open")}
          onPress={() => setFeedbackOpen(true)}
        >
          <Text style={styles.linkLabel}>{t("feedback.open")}</Text>
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
          <Text style={styles.linkLabel}>{t("support.contact")}</Text>
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
            {restoring ? t("pro.restoring") : t("pro.restore")}
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
          <Text style={styles.linkLabel}>{t("legal.terms")}</Text>
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
          <Text style={styles.linkLabel}>{t("legal.privacy")}</Text>
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
          {signingOut ? t("account.signingOut") : t("account.signOut")}
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
          {deleting ? t("account.deleting") : t("account.delete")}
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
