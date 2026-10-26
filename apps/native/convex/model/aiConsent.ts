import { ConvexError } from "convex/values";

export const AI_CONSENT_VERSION = 1;

const AI_CONSENT_REQUIRED = "ai_consent_required";

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
