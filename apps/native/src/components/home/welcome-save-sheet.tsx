import { t, useAppLocale } from "@/lib/i18n";
import { analytics } from "@/lib/analytics";
import { formatShortDate } from "@/lib/date";
import { whenSheetSettled } from "@/lib/entitlement";
import { useWelcomeSheetVisible, welcomeSave } from "@/lib/welcome-save";
import { CtaButton, GhostButton } from "@/components/onboarding/parts";
import { PromptSheet } from "@/components/ui/prompt-sheet";
import { useRouter } from "expo-router";
import { useEffect, useRef } from "react";

/**
 * Right after Pro starts: confirm it, then hand off to one real save. The
 * trial line is the real end date from the entitlement. Queued by
 * `useWelcomeSaveTracker`; `ready` holds it until Home owns the screen.
 */
export function WelcomeSaveSheet({
  userId,
  ready,
  trialEndsAt,
}: {
  userId: string;
  ready: boolean;
  trialEndsAt?: number;
}) {
  useAppLocale();
  const router = useRouter();
  const visible = useWelcomeSheetVisible(userId, ready);
  const trial = trialEndsAt !== undefined;

  const shownRef = useRef(false);
  useEffect(() => {
    if (!visible || shownRef.current) return;
    shownRef.current = true;
    analytics.capture("welcome_save_shown", { trial });
  }, [visible, trial]);

  const finish = (action: "save" | "dismiss") => {
    welcomeSave.finish(userId);
    analytics.capture("welcome_save_action", { action, trial });
  };
  const close = () => finish("dismiss");
  const save = () => {
    finish("save");
    // Pushing the add sheet while this modal slides away drops it on iOS.
    void whenSheetSettled().then(() => router.push("/add"));
  };

  return (
    <PromptSheet
      testID="welcome-save-sheet"
      visible={visible}
      onClose={close}
      title={t("welcome.title")}
      body={
        trial
          ? t("welcome.trialBody", { date: formatShortDate(trialEndsAt) })
          : t("welcome.body")
      }
      actions={
        <>
          <CtaButton label={t("welcome.cta")} onPress={save} />
          <GhostButton label={t("common.notNow")} onPress={close} />
        </>
      }
    />
  );
}
