import { ConvexError } from "convex/values";

// No server-runtime imports, so the native app can load this module as
// `@convex/model/aiConsent`.

/** The disclosure the user answered. Bump it when what is sent, or who it is
 * sent to, changes: an answer to an older version reads as `unset` again. */
export const AI_CONSENT_VERSION = 1;

const AI_CONSENT_REQUIRED = "ai_consent_required";

/** Thrown when the user asks for an AI feature after turning AI processing
 * off. A ConvexError, because production redacts a plain Error's message. */
export function aiConsentRequiredError(): ConvexError<{
  code: typeof AI_CONSENT_REQUIRED;
  message: string;
}> {
  return new ConvexError({
    code: AI_CONSENT_REQUIRED,
    message: "AI processing is turned off",
  });
}

export function isAiConsentRequired(error: unknown): boolean {
  if (!(error instanceof ConvexError)) return false;
  const data: unknown = error.data;
  return (
    typeof data === "object" &&
    data !== null &&
    (data as Record<string, unknown>).code === AI_CONSENT_REQUIRED
  );
}
