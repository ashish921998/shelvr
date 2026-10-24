import { AiConsentSetting } from "@/components/ai-consent";
import { LegalConsentPreference } from "@/components/legal-consent";
import { UpdateSetting } from "@/components/update-setting";
import { HeaderIconButton } from "@/components/ui/header-icon-button";
import { SettingCard } from "@/components/ui/setting-card";
import { SettingsGroup, SettingsRow } from "@/components/ui/settings-list";
import { analytics } from "@/lib/analytics";
import { isAnonymousAuthEnabled } from "@/lib/anonymous-auth";
import { useCurrentUser } from "@/lib/current-user";
import { useEntitlement } from "@/lib/entitlement";
import { t, useAppLocale } from "@/lib/i18n";
import { LEGAL_URLS, SUPPORT_EMAIL, SUPPORT_URL } from "@/lib/legal";
import { manageSubscription } from "@/lib/manage-subscription";
import {
  backOrHome,
  closeScreen,
  type ClosingScreen,
} from "@/lib/screen-dismiss";
import { useNotificationSession } from "@/lib/notifications";
import { useNotificationPermission } from "@/lib/use-notification-permission";
import { useRestorePurchases } from "@/lib/use-restore-purchases";
import { api } from "@convex/_generated/api";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { useMutation } from "convex/react";
import { useNavigation, useRouter } from "expo-router";
import { useState } from "react";
import {
  Alert,
  Linking,
  Pressable,
  ScrollView,
  Switch,
  Text,
  View,
} from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

export default function SettingsScreen() {
  useAppLocale();
  const { session, operation } = useNotificationSession();
  const deleting = operation === "delete_account";
  const busy = operation !== "idle";
  const { data: user } = useCurrentUser();
  const router = useRouter();
  // Typed to what is used here: the native stack's transitionEnd isn't in
  // expo-router's generic navigation type.
  const navigation = useNavigation() as ClosingScreen & {
    getState: () => { routes: { name: string }[] };
  };
  const { theme } = useUnistyles();
  const { data: notificationPreferences } = useQuery(
    convexQuery(api.notifications.getPreferences, {}),
  );
  // A preference left on without the device's permission delivers nothing, so
  // it shows off; turning it on asks for the permission or opens Settings.
  const permission = useNotificationPermission();
  const notificationsAllowed =
    permission === undefined || permission === "granted";
  const { status: entitlementStatus } = useEntitlement();
  const hasLiveSubscription =
    entitlementStatus === "trialing" || entitlementStatus === "pro";
  const { restoring, restore } = useRestorePurchases();
  const [resettingFixtures, setResettingFixtures] = useState(false);
  const fixtureResetEnabled = isAnonymousAuthEnabled();
  const { data: canResetFlowFixtures } = useQuery(
    convexQuery(
      api.devFixtures.canResetCurrentUser,
      fixtureResetEnabled && user ? {} : "skip",
    ),
  );
  const resetFlowFixtures = useMutation(api.devFixtures.resetCurrentUser);

  const close = () => backOrHome(router);

  const closeAllSheets = () => {
    const profileIsRoot = navigation.getState().routes[0]?.name === "profile";
    router.dismissAll();
    if (profileIsRoot) router.replace("/(app)/(tabs)/(home)");
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
        ...(hasLiveSubscription
          ? [
              {
                text: t("pro.manage"),
                onPress: () =>
                  void manageSubscription(() =>
                    closeScreen(navigation, closeAllSheets),
                  ),
              },
            ]
          : []),
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
        <HeaderIconButton
          icon="xmark"
          label={t("common.close")}
          onPress={close}
        />
      </View>

      <SettingCard
        title={t("notifications.weeklyShelf")}
        description={t("notifications.weeklyHelp")}
        accessory={
          <Switch
            accessibilityLabel={t("notifications.toggleLabel")}
            value={
              notificationsAllowed &&
              (notificationPreferences?.weeklyShelfEnabled ?? false)
            }
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
            value={
              notificationsAllowed &&
              (notificationPreferences?.remindersEnabled ?? false)
            }
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

      <AiConsentSetting />

      <LegalConsentPreference />

      <SettingsGroup>
        <SettingsRow
          divider={false}
          label={restoring ? t("pro.restoring") : t("pro.restore")}
          icon="arrow.clockwise"
          disabled={restoring}
          onPress={() => void restore()}
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
