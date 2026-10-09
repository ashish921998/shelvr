import { t, useAppLocale } from "@/lib/i18n";
import { FeedbackModal } from "@/components/feedback/feedback-modal";
import { ActionMenu } from "@/components/ui/action-menu";
import { SettingsGroup, SettingsRow } from "@/components/ui/settings-list";
import { Wordmark } from "@/components/wordmark";
import { HeaderIconButton } from "@/components/ui/header-icon-button";
import { APPEARANCE_LABELS, APPEARANCE_MODES } from "@/lib/appearance";
import { useAppearanceMode } from "@/lib/appearance-runtime";
import {
  openPaywall,
  useEntitlement,
  waitForSheetTransition,
} from "@/lib/entitlement";
import { manageSubscription } from "@/lib/manage-subscription";
import { analytics } from "@/lib/analytics";
import { useCurrentUser } from "@/lib/current-user";
import { useNotificationSession } from "@/lib/notifications";
import { api } from "@convex/_generated/api";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { AppSymbolIcon } from "@/components/symbol";
import { useState } from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

export default function ProfileScreen() {
  useAppLocale();
  const { session, operation } = useNotificationSession();
  const signingOut = operation === "sign_out";
  const busy = operation !== "idle";
  const { data: user } = useCurrentUser();
  const router = useRouter();
  const { theme } = useUnistyles();
  const { status, loading } = useEntitlement();
  const { data: photoUsage } = useQuery(convexQuery(api.items.photoUsage, {}));
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const { mode: appearanceMode, setMode: setAppearanceMode } =
    useAppearanceMode();

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
  // A lapsed trial or subscription has nothing left to manage: the way back is
  // a new purchase, so that row opens the paywall rather than Customer Center.
  const opensPaywall = status === "none" || status === "lapsed";

  // An active subscriber goes to Customer Center, which can only present
  // once this profile sheet is gone; a `none` or lapsed user to the paywall,
  // after the same dismissal.
  const openSubscription = async () => {
    if (loading) return;
    if (!opensPaywall) {
      await manageSubscription(() => router.back());
      return;
    }
    router.back();
    await waitForSheetTransition();
    void openPaywall(
      router,
      status === "lapsed" ? "profile_lapsed" : "profile",
    );
  };

  const handleSignOut = async () => {
    try {
      await session.signOut();
    } catch (error) {
      analytics.captureError("sign_out_failed", error);
      Alert.alert(t("account.signOutFailed"), t("errors.connection"));
    }
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
        <View style={styles.accountRow}>
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
        <Pressable
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.proRow,
            pressed && { opacity: 0.7 },
            loading && { opacity: 0.4 },
          ]}
          disabled={loading}
          onPress={openSubscription}
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
      </View>

      <SettingsGroup>
        <ActionMenu
          label={t("profile.appearanceLabel", {
            appearance: t(APPEARANCE_LABELS[appearanceMode]),
          })}
          title={t("profile.appearance")}
          actions={APPEARANCE_MODES.map((mode) => ({
            id: mode,
            label: t(APPEARANCE_LABELS[mode]),
            selected: mode === appearanceMode,
            onPress: () => setAppearanceMode(mode),
          }))}
        >
          <SettingsRow
            divider={false}
            label={t("profile.appearance")}
            value={t(APPEARANCE_LABELS[appearanceMode])}
          />
        </ActionMenu>
        <SettingsRow
          label={t("import.title")}
          onPress={() => router.push("/import")}
        />
        <SettingsRow
          label={t("feedback.open")}
          icon="arrow.up.right"
          onPress={() => setFeedbackOpen(true)}
        />
        <SettingsRow
          label={t("profile.settings")}
          onPress={() => router.push("/settings")}
        />
      </SettingsGroup>

      <Pressable
        accessibilityRole="button"
        style={({ pressed }) => [styles.signOut, pressed && { opacity: 0.7 }]}
        disabled={busy}
        onPress={() => void handleSignOut()}
      >
        <Text style={styles.signOutText}>
          {signingOut ? t("account.signingOut") : t("account.signOut")}
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
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignSelf: "stretch",
    overflow: "hidden",
  },
  accountRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.gap(1.5),
    padding: theme.gap(1.5),
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
    minHeight: 48,
    paddingVertical: theme.gap(1.25),
    paddingHorizontal: theme.gap(1.5),
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.border,
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
}));
