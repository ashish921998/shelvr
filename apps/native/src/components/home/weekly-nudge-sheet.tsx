import { t, useAppLocale } from "@/lib/i18n";
import { analytics } from "@/lib/analytics";
import { weeklyNudge } from "@/lib/first-share";
import { useNotificationSession } from "@/lib/notifications";
import { NotificationPreview } from "@/components/notification-preview";
import { CtaButton, GhostButton } from "@/components/onboarding/parts";
import { api } from "@convex/_generated/api";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { PromptSheet } from "@/components/ui/prompt-sheet";
import { useEffect, useState } from "react";
import { Alert, Linking } from "react-native";

/**
 * Asks once whether to turn on the weekly shelf. Queued by the first
 * share-sheet save; `ready` holds it back until Home says the moment is right
 * (see `shouldOfferWeeklyNudge`).
 */
export function WeeklyNudgeSheet({
  userId,
  previewTitle,
  ready,
}: {
  userId: string;
  previewTitle?: string;
  ready: boolean;
}) {
  useAppLocale();
  const { session } = useNotificationSession();
  const pending = weeklyNudge.usePending(userId);
  const [busy, setBusy] = useState(false);
  const { data: preferences } = useQuery({
    ...convexQuery(
      api.notifications.getPreferences,
      // 'skip', not `enabled`: a disabled React Query still subscribes
      // through the Convex adapter (see the pager).
      pending && ready ? {} : "skip",
    ),
  });
  const alreadyOn = preferences?.weeklyShelfEnabled === true;

  useEffect(() => {
    // Finishing flips `pending`, so the preferences query goes back to "skip".
    if (pending && alreadyOn) weeklyNudge.finish(userId);
  }, [pending, alreadyOn, userId]);

  const close = () => weeklyNudge.finish(userId);

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

  const visible = pending && ready && preferences !== undefined && !alreadyOn;

  return (
    <PromptSheet
      visible={visible}
      onClose={close}
      title={t("weekly.nudgeTitle")}
      body={t("weekly.nudgeBody")}
      actions={
        <>
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
        </>
      }
    >
      <NotificationPreview
        body={
          previewTitle
            ? t("weekly.previewBody", { title: previewTitle })
            : t("weekly.previewFallback")
        }
      />
    </PromptSheet>
  );
}
