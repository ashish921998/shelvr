import { t, useAppLocale } from "@/lib/i18n";
import { analytics } from "@/lib/analytics";
import { finishWeeklyNudge, isWeeklyNudgePending } from "@/lib/first-share";
import { useNotificationSession } from "@/lib/notifications";
import { NotificationPreview } from "@/components/notification-preview";
import { CtaButton, GhostButton } from "@/components/onboarding/parts";
import { api } from "@convex/_generated/api";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Alert, Linking, Modal, Pressable, Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

/** Asks once, after the first share-sheet save, whether to turn on the weekly shelf. */
export function WeeklyNudgeSheet({
  userId,
  previewTitle,
}: {
  userId: string;
  previewTitle?: string;
}) {
  useAppLocale();
  const { session } = useNotificationSession();
  const [pending, setPending] = useState(() => isWeeklyNudgePending(userId));
  const [busy, setBusy] = useState(false);
  useFocusEffect(
    useCallback(() => setPending(isWeeklyNudgePending(userId)), [userId]),
  );
  const { data: preferences } = useQuery({
    ...convexQuery(
      api.notifications.getPreferences,
      // 'skip', not `enabled`: a disabled React Query still subscribes
      // through the Convex adapter (see the pager).
      pending ? {} : "skip",
    ),
  });
  const alreadyOn = preferences?.weeklyShelfEnabled === true;

  useEffect(() => {
    if (pending && alreadyOn) {
      finishWeeklyNudge(userId);
    }
  }, [pending, alreadyOn, userId]);

  const close = () => {
    finishWeeklyNudge(userId);
    setPending(false);
  };

  const remind = async () => {
    setBusy(true);
    try {
      const enabled = await session.setWeeklyShelf(true);
      if (enabled === false) {
        Alert.alert(
          t("notifications.disabledTitle"),
          t("notifications.disabledBody"),
          [
            { text: t("common.cancel"), style: "cancel", onPress: close },
            {
              text: t("permissions.openSettings"),
              onPress: () => void Linking.openSettings(),
            },
          ],
        );
      }
      // Keep the prompt available after Settings, or while another session
      // operation is busy. Only a saved preference completes this opt-in.
      if (enabled === true) close();
    } catch (err) {
      // Keep the nudge pending so the user can try again.
      analytics.captureError("weekly_shelf_preference_failed", err);
      Alert.alert(t("notifications.updateFailed"), t("errors.trySoon"));
    } finally {
      setBusy(false);
    }
  };

  const visible = pending && preferences !== undefined && !alreadyOn;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={close}
    >
      <View style={styles.backdrop}>
        <Pressable
          style={styles.scrim}
          onPress={close}
          accessibilityRole="button"
          accessibilityLabel={t("common.notNow")}
        />
        <View style={styles.sheet}>
          <View style={styles.grabber} />
          <Text style={styles.title}>{t("weekly.nudgeTitle")}</Text>
          <Text style={styles.body}>{t("weekly.nudgeBody")}</Text>
          <NotificationPreview
            body={
              previewTitle
                ? t("weekly.previewBody", { title: previewTitle })
                : t("weekly.previewFallback")
            }
          />
          <View style={styles.actions}>
            <CtaButton
              label={t("weekly.remindMe")}
              onPress={() => void remind()}
              busy={busy}
            />
            <GhostButton
              label={t("common.notNow")}
              onPress={close}
              disabled={busy}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  backdrop: {
    flex: 1,
    justifyContent: "flex-end",
  },
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: theme.colors.overlay,
  },
  sheet: {
    gap: theme.gap(1.5),
    paddingHorizontal: theme.gap(3),
    paddingTop: theme.gap(1.5),
    paddingBottom: rt.insets.bottom + theme.gap(2),
    borderTopLeftRadius: theme.radius.xl,
    borderTopRightRadius: theme.radius.xl,
    borderCurve: "continuous",
    backgroundColor: theme.colors.background,
  },
  grabber: {
    alignSelf: "center",
    width: 36,
    height: 5,
    borderRadius: 3,
    backgroundColor: theme.colors.border,
    marginBottom: theme.gap(1),
  },
  title: {
    fontFamily: theme.fonts.bold,
    fontSize: 22,
    lineHeight: 28,
    color: theme.colors.foreground,
  },
  body: {
    fontFamily: theme.fonts.regular,
    fontSize: 15,
    lineHeight: 21,
    color: theme.colors.muted,
  },
  actions: {
    gap: theme.gap(0.5),
    marginTop: theme.gap(1),
  },
}));
