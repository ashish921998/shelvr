import { useCallback } from "react";
import Constants from "expo-constants";
import { Platform } from "react-native";
import { useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import { analytics } from "@/lib/analytics";
import {
  feedbackAnalytics,
  sanitizeFeedbackMessage,
  type FeedbackSurface,
} from "@/lib/feedback";

type SubmitFeedbackResult = "accepted" | "failed";

/**
 * Bounded app context for the support reply, supplied as bounded values the
 * backend re-validates (platform is a closed union; the version strings are
 * capped server-side). Never user content.
 */
function submissionContext() {
  const version = Constants.expoConfig?.version;
  const variant = Constants.expoConfig?.extra?.variant;
  return {
    ...(Platform.OS === "ios" || Platform.OS === "android"
      ? { platform: Platform.OS }
      : {}),
    ...(typeof version === "string" && version.length > 0
      ? { appVersion: version }
      : {}),
    ...(variant !== undefined && variant !== null
      ? { buildVariant: String(variant) }
      : {}),
  };
}

/**
 * Send in-app feedback through the Convex `submitFeedback` mutation.
 *
 * "accepted" means ONLY that Convex persisted the submission — the support
 * inbox email is a server-side projection the client never claims as sent.
 * Any failure (offline, validation, rate limit) returns "failed" so the modal
 * can keep the draft and offer the support channel; nothing is captured and
 * the feedback invitation is not marked submitted.
 */
export function useSubmitFeedback(surface: FeedbackSurface) {
  const submitFeedback = useMutation(api.feedback.submitFeedback);
  return useCallback(
    async (rawMessage: string): Promise<SubmitFeedbackResult> => {
      const message = sanitizeFeedbackMessage(rawMessage);
      if (!message) return "failed";
      try {
        const { deliveryState } = await submitFeedback({
          message,
          surface,
          ...submissionContext(),
        });
        feedbackAnalytics.submitted(surface, message.length, deliveryState);
        return "accepted";
      } catch (error) {
        analytics.captureError("feedback_submit_failed", error);
        return "failed";
      }
    },
    [submitFeedback, surface],
  );
}
