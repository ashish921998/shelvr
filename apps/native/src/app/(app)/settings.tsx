import { LegalConsentPreference } from "@/components/legal-consent";
import { UpdateSetting } from "@/components/update-setting";
import { HeaderIconButton } from "@/components/ui/header-icon-button";
import { SettingCard } from "@/components/ui/setting-card";
import { SettingsGroup, SettingsRow } from "@/components/ui/settings-list";
import { analytics } from "@/lib/analytics";
import { isAnonymousAuthEnabled } from "@/lib/anonymous-auth";
import { useCurrentUser } from "@/lib/current-user";
import { restorePurchases } from "@/lib/entitlement";
import { t, useAppLocale } from "@/lib/i18n";
import { LEGAL_URLS, SUPPORT_EMAIL, SUPPORT_URL } from "@/lib/legal";
import { useNotificationSession } from "@/lib/notifications";
import { api } from "@convex/_generated/api";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { useMutation } from "convex/react";
import { useRouter } from "expo-router";
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

/**
 * The less frequent account settings, one tap from the Profile sheet so the
 * sheet itself fits without scrolling. Restore purchases, the legal links and
 * account deletion live here; App Review expects them in the app's settings.
 */
export default function SettingsScreen() {
  useAppLocale();
  const { session, operation } = useNotificationSession();
  const deleting = operation === "delete_account";
  const busy = operation !== "idle";
  const { data: user } = useCurrentUser();
  const router = useRouter();
  const { theme } = useUnistyles();
  const { data: notificationPreferences } = useQuery(
    convexQuery(api.notifications.getPreferences, {}),
  );
  const [restoring, setRestoring] = useState(false);
  const [resettingFixtures, setResettingFixtures] = useState(false);
  const fixtureResetEnabled = isAnonymousAuthEnabled();
  const { data: canResetFlowFixtures } = useQuery(
    convexQuery(
      api.devFixtures.canResetCurrentUser,
      fixtureResetEnabled && user ? {} : "skip",
    ),
  );
  const resetFlowFixtures = useMutation(api.devFixtures.resetCurrentUser);

  const close = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/");
    }
  };

  const openExternal = (url: string) => {
    void Linking.openURL(url);
  };

  const toggleNotifications = async (
    kind: "weekly_shelf" | "save_reminders",
    enabled: boolean,
  ) => {
    try {
      const saved =
        kind === "weekly_shelf"
          ? await session.setWeeklyShelf(enabled)
          : await session.setSaveReminders(enabled);
      if (saved === false) {
        Alert.alert(
          t("notifications.disabledTitle"),
          t(
            kind === "weekly_shelf"
              ? "notifications.disabledBody"
              : "notifications.remindersDisabledBody",
          ),
          [
            { text: t("common.cancel"), style: "cancel" },
            {
              text: t("permissions.openSettings"),
              onPress: () => void Linking.openSettings(),
            },
          ],
        );
        return;
      }
      // Only a saved preference is a decision. `undefined` means another
      // session operation held the queue and this toggle changed nothing.
      if (saved === true && !enabled)
        analytics.capture("notification_disabled", { notification_kind: kind });
    } catch (error) {
      analytics.captureError(
        kind === "weekly_shelf"
          ? "weekly_shelf_preference_failed"
          : "save_reminders_preference_failed",
        error,
      );
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
                  t("errors.contactSupport", { supportEmail: SUPPORT_EMAIL }),
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
      // Lets the Android form sheet hand drags to this list once it is full
      // height, instead of only dragging the sheet.
      nestedScrollEnabled
      contentContainerStyle={styles.content}
    >
      <View style={styles.sheetHeader}>
        <Text accessibilityRole="header" style={styles.title}>
          {t("profile.settings")}
        </Text>
        {Platform.OS === "android" ? (
          <HeaderIconButton
            icon="xmark"
            label={t("common.close")}
            onPress={close}
          />
        ) : null}
      </View>

      <SettingCard
        title={t("notifications.weeklyShelf")}
        description={t("notifications.weeklyHelp")}
        accessory={
          <Switch
            accessibilityLabel={t("notifications.toggleLabel")}
            value={notificationPreferences?.weeklyShelfEnabled ?? false}
            disabled={notificationPreferences === undefined || busy}
            onValueChange={(value) =>
              void toggleNotifications("weekly_shelf", value)
            }
            trackColor={{
              false: theme.colors.border,
              true: theme.colors.primary,
            }}
            thumbColor="#fff"
          />
        }
      />

      <SettingCard
        title={t("notifications.remindersLabel")}
        description={t("notifications.remindersHelp")}
        accessory={
          <Switch
            accessibilityLabel={t("notifications.remindersToggle")}
            // Older backends return no field; show it off rather than guess.
            value={notificationPreferences?.remindersEnabled ?? false}
            disabled={notificationPreferences === undefined || busy}
            onValueChange={(value) =>
              void toggleNotifications("save_reminders", value)
            }
            trackColor={{
              false: theme.colors.border,
              true: theme.colors.primary,
            }}
            thumbColor="#fff"
          />
        }
      />

      <UpdateSetting />

      <LegalConsentPreference />

      <SettingsGroup>
        <SettingsRow
          divider={false}
          label={restoring ? t("pro.restoring") : t("pro.restore")}
          icon="arrow.clockwise"
          disabled={restoring}
          onPress={() => void handleRestorePurchases()}
        />
        <SettingsRow
          label={t("support.contact")}
          icon="arrow.up.right"
          onPress={() => openExternal(SUPPORT_URL)}
        />
        <SettingsRow
          label={t("legal.terms")}
          icon="arrow.up.right"
          onPress={() => openExternal(LEGAL_URLS.terms)}
        />
        <SettingsRow
          label={t("legal.privacy")}
          icon="arrow.up.right"
          onPress={() => openExternal(LEGAL_URLS.privacy)}
        />
      </SettingsGroup>

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
        accessibilityRole="button"
        style={({ pressed }) => [
          styles.deleteAccount,
          pressed && { opacity: 0.7 },
          busy && { opacity: 0.4 },
        ]}
        disabled={busy}
        onPress={confirmDeleteAccount}
      >
        <Text style={styles.deleteAccountText}>
          {deleting ? t("account.deleting") : t("account.delete")}
        </Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  content: {
    padding: theme.gap(3),
    paddingTop: theme.gap(4),
    // Keeps Delete account clear of the home indicator at full height.
    paddingBottom: rt.insets.bottom + theme.gap(4),
    gap: theme.gap(1.5),
  },
  sheetHeader: {
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: {
    fontFamily: theme.fonts.display,
    fontSize: 24,
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
  deleteAccount: {
    alignSelf: "stretch",
    alignItems: "center",
    paddingVertical: theme.gap(1.5),
    borderRadius: theme.radius.md,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  deleteAccountText: {
    fontFamily: theme.fonts.bold,
    fontSize: 15,
    color: theme.colors.danger,
  },
}));
