import { wrapLanguageModel } from "ai";
import { google } from "@ai-sdk/google";
import { env } from "../_generated/server";
import { FAKE_MODEL, fakeAiLocks } from "./fakeAi";
import { logEvent } from "./log";

export const MODEL_NAME = "gemini-3.1-flash-lite";

const fakeAi = fakeAiLocks({
  E2E_FAKE_AI: env.E2E_FAKE_AI,
  AUTH_ENABLE_ANONYMOUS: env.AUTH_ENABLE_ANONYMOUS,
  GOOGLE_GENERATIVE_AI_API_KEY: env.GOOGLE_GENERATIVE_AI_API_KEY,
  CONVEX_CLOUD_URL: process.env.CONVEX_CLOUD_URL,
});
export const FAKE_AI_ENABLED = fakeAi.enabled;
if (!fakeAi.enabled && fakeAi.refusedBy !== "switch_off") {
  logEvent("error", "fake_ai_refused", { refused_by: fakeAi.refusedBy });
}

export const MODEL = wrapLanguageModel({
  model: fakeAi.enabled ? FAKE_MODEL : google(MODEL_NAME),
  middleware: {
    wrapGenerate: async ({ doGenerate }) => {
      const result = await doGenerate();
      logEvent("info", "model_usage", {
        model: fakeAi.enabled ? FAKE_MODEL.modelId : MODEL_NAME,
        input_tokens: result.usage.inputTokens.total,
        cache_read_tokens: result.usage.inputTokens.cacheRead,
        output_tokens: result.usage.outputTokens.total,
        reasoning_tokens: result.usage.outputTokens.reasoning,
      });
      return result;
    },
  },
});

const MODEL_MAX_RETRIES = 1;

export function modelCallOptions(timeoutMs: number): {
  abortSignal: AbortSignal;
  maxRetries: number;
} {
  return {
    abortSignal: AbortSignal.timeout(timeoutMs),
    maxRetries: MODEL_MAX_RETRIES,
  };
}

/** The SDK rethrows the raw abort reason, a DOMException named TimeoutError or AbortError. */
export function isModelTimeout(error: unknown): boolean {
  return (
    error !== null &&
    typeof error === "object" &&
    "name" in error &&
    (error.name === "TimeoutError" || error.name === "AbortError")
  );
}
