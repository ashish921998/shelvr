import { createContext, type ReactNode, useContext } from "react";
import { FeedbackModal } from "@/components/feedback/feedback-modal";
import { WelcomeSaveSheet } from "@/components/home/welcome-save-sheet";
import { NameSheet } from "@/components/shared-list/name-sheet";
import { saveWaiting } from "@/lib/access";
import { useCurrentUser } from "@/lib/current-user";
import { type Entitlement, useEntitlement } from "@/lib/entitlement";
import { useFeedbackInvitation } from "@/lib/feedback-invitation";
import { useAccess } from "@/lib/free-plan";
import { useHomeFeed } from "@/lib/home-feed";
import { useHoldSheetTurns, useSheetTurnsBusy } from "@/lib/one-time-sheets";
import { useReviewPrompt } from "@/lib/review-prompt";
import { useCancelSurvey } from "@/lib/use-cancel-survey";
import { useWelcomeName } from "@/lib/welcome-name";

type OneTimePromptState = {
  cancelSurvey: ReturnType<typeof useCancelSurvey>;
  feedback: ReturnType<typeof useFeedbackInvitation>;
};

const OneTimePromptContext = createContext<OneTimePromptState | null>(null);

function trialEnd(entitlement: Entitlement): number | undefined {
  return entitlement.status === "trialing" ? entitlement.expiresAt : undefined;
}

export function OneTimePrompts({ children }: { children: ReactNode }) {
  const { items } = useHomeFeed();
  const cancelSurvey = useCancelSurvey();
  const entitlement = useEntitlement();
  const access = useAccess();
  const { data: user } = useCurrentUser();
  const welcomeName = useWelcomeName(
    user?._id,
    items !== undefined &&
      !cancelSurvey.visible &&
      !entitlement.loading &&
      !saveWaiting(access),
  );
  const sheetsBusy = useSheetTurnsBusy();
  const deferPrompts =
    cancelSurvey.visible ||
    entitlement.loading ||
    access.kind === "locked" ||
    sheetsBusy ||
    welcomeName.pending;
  const feedback = useFeedbackInvitation(items, { defer: deferPrompts });
  useHoldSheetTurns(feedback.modalOpen);
  useReviewPrompt(items, {
    defer: deferPrompts || feedback.invitationVisible || feedback.modalOpen,
  });

  return (
    <OneTimePromptContext.Provider value={{ cancelSurvey, feedback }}>
      {children}
      {user ? (
        <WelcomeSaveSheet
          userId={user._id}
          ready={entitlement.entitled && !cancelSurvey.visible}
          trialEndsAt={trialEnd(entitlement)}
        />
      ) : null}
      <NameSheet
        visible={welcomeName.open}
        kind="welcome"
        onDone={welcomeName.close}
        onCancel={welcomeName.close}
      />
      {feedback.modalOpen ? (
        <FeedbackModal surface="home" onClose={feedback.closeFeedback} />
      ) : null}
    </OneTimePromptContext.Provider>
  );
}

export function useOneTimePrompts(): OneTimePromptState {
  const state = useContext(OneTimePromptContext);
  if (state === null)
    throw new Error("useOneTimePrompts needs OneTimePrompts above it");
  return state;
}
