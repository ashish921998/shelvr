import { t, useAppLocale } from "@/lib/i18n";
import {
  trialReminderPrimer,
  useTrialReminderPrimerOpen,
} from "@/lib/trial-reminder";
import { NotificationPreview } from "@/components/notification-preview";
import { CtaButton, GhostButton } from "@/components/onboarding/parts";
import { PromptSheet } from "@/components/ui/prompt-sheet";

/**
 * Says what the trial reminder is for before the OS permission prompt, so the
 * ask comes with a reason the user cares about: no surprise renewal.
 */
export function TrialReminderPrimerSheet() {
  useAppLocale();
  const open = useTrialReminderPrimerOpen();
  const decline = () => trialReminderPrimer.answer(false);

  return (
    <PromptSheet
      visible={open}
      onClose={decline}
      title={t("notifications.trialPrimerTitle")}
      body={t("notifications.trialPrimerBody")}
      testID="trial-reminder-primer"
      actions={
        <>
          <CtaButton
            label={t("notifications.trialPrimerAllow")}
            onPress={() => trialReminderPrimer.answer(true)}
          />
          <GhostButton label={t("common.notNow")} onPress={decline} />
        </>
      }
    >
      <NotificationPreview
        title={t("notifications.trialEndingTitle")}
        body={t("notifications.trialEndingBody")}
        when={t("notifications.trialPrimerWhen")}
      />
    </PromptSheet>
  );
}
