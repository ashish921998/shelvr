import { useFocusEffect, useSegments } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { useCallback, useEffect, useRef, useState } from "react";
import { analytics } from "@/lib/analytics";
import {
  countEligibleSaves,
  type FeedbackFeedItem,
  isHomeRootRoute,
} from "@/lib/feedback";
import { isAnalyticsAvailable } from "@/lib/posthog";

// The product-market-fit question ("How would you feel if you could no
// longer use Shelvr?"), asked once per account on Home. PostHog holds the
// survey as an `api` survey: the app renders it and sends PostHog's own
// survey events, so the answers land in PostHog Surveys next to the 40%
// "very disappointed" bar.

/** The PostHog survey and its one question. */
export const PMF_SURVEY_ID = "01a11b3d-d7b4-0000-dc85-c12ca04535fb";
const PMF_QUESTION_ID = "b23b3172-892d-48cc-bccb-a7b9fd6a68ed";
const PMF_QUESTION = "How would you feel if you could no longer use Shelvr?";

/** The choices, in order, with the exact English text PostHog stores. The
 * app shows translated labels; the stored answer stays the same everywhere. */
export const PMF_CHOICES = {
  very: "Very disappointed",
  somewhat: "Somewhat disappointed",
  not: "Not disappointed",
} as const;
export type PmfChoice = keyof typeof PMF_CHOICES;

/** Ready saves before the question makes sense: someone has to have used
 * Shelvr to say how they would feel without it. */
const PMF_MIN_SAVES = 2;

const doneKey = (userId: string) => `shelvr.pmfSurvey.${userId}`;

function isDone(userId: string): boolean {
  return SecureStore.getItem(doneKey(userId)) === "done";
}

function markDone(userId: string): void {
  SecureStore.setItem(doneKey(userId), "done");
}

/**
 * Whether the survey card shows, and its answer and dismiss handlers. It
 * shows on Home once the account has `PMF_MIN_SAVES` ready saves, until it is
 * answered or dismissed, and never while `defer` is set (another Home card
 * holds the moment) or when analytics cannot record the answer.
 */
export function usePmfSurvey(
  userId: string | undefined,
  items: FeedbackFeedItem[] | undefined,
  { defer = false } = {},
) {
  const home = isHomeRootRoute(useSegments());
  // Re-read the stored flag when Home gains focus.
  const [, setVersion] = useState(0);
  useFocusEffect(useCallback(() => setVersion((v) => v + 1), []));

  const visible =
    home &&
    !defer &&
    userId !== undefined &&
    items !== undefined &&
    countEligibleSaves(items) >= PMF_MIN_SAVES &&
    isAnalyticsAvailable() &&
    !isDone(userId);

  const shownFor = useRef<string | null>(null);
  useEffect(() => {
    if (!visible || !userId || shownFor.current === userId) return;
    shownFor.current = userId;
    analytics.capture("survey shown", { $survey_id: PMF_SURVEY_ID });
  }, [visible, userId]);

  const answer = useCallback(
    (choice: PmfChoice) => {
      if (!userId) return;
      const response = PMF_CHOICES[choice];
      analytics.capture("survey sent", {
        $survey_id: PMF_SURVEY_ID,
        $survey_questions: [
          { id: PMF_QUESTION_ID, question: PMF_QUESTION, response },
        ],
        [`$survey_response_${PMF_QUESTION_ID}`]: response,
        $survey_completed: true,
        $set: { [`$survey_responded/${PMF_SURVEY_ID}`]: true },
      });
      markDone(userId);
      setVersion((v) => v + 1);
    },
    [userId],
  );

  const dismiss = useCallback(() => {
    if (!userId) return;
    analytics.capture("survey dismissed", {
      $survey_id: PMF_SURVEY_ID,
      $set: { [`$survey_dismissed/${PMF_SURVEY_ID}`]: true },
    });
    markDone(userId);
    setVersion((v) => v + 1);
  }, [userId]);

  return { visible, answer, dismiss };
}
