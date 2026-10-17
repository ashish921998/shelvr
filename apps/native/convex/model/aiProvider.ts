import { wrapLanguageModel } from "ai";
import { google } from "@ai-sdk/google";
import { env } from "../_generated/server";
import { FAKE_MODEL, fakeAiLocks } from "./fakeAi";
import { logEvent } from "./log";

// Call Google directly (no Vercel AI Gateway). The default `google` provider
// reads the GOOGLE_GENERATIVE_AI_API_KEY deployment env var.
export const MODEL_NAME = "gemini-3.1-flash-lite";

// The e2e job's local backend swaps in the deterministic fake. Every lock in
// fakeAiLocks must hold; a switch set anywhere else is refused and logged.
const fakeAi = fakeAiLocks({
  E2E_FAKE_AI: env.E2E_FAKE_AI,
  AUTH_ENABLE_ANONYMOUS: env.AUTH_ENABLE_ANONYMOUS,
  GOOGLE_GENERATIVE_AI_API_KEY: env.GOOGLE_GENERATIVE_AI_API_KEY,
  CONVEX_CLOUD_URL: process.env.CONVEX_CLOUD_URL,
});
/** True only on the e2e job's local backend, where fixture pages stand in
 * for real reads too. */
export const FAKE_AI_ENABLED = fakeAi.enabled;
if (!fakeAi.enabled && fakeAi.refusedBy !== "switch_off") {
  logEvent("error", "fake_ai_refused", { refused_by: fakeAi.refusedBy });
}

// Token usage lands in the Convex log stream of whichever action made the call,
// so classification and product-search spend can be told apart per invocation.
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

// Deadlines for every generateObject call. Without one a hung provider holds
// the action until Convex kills it at 10 minutes and the item stays
// `processing` with no failure path. The signal spans retries (the SDK does
// not retry an abort), so each figure is the per-call worst case. Per action
// the budget is one model call plus the safeFetch deadlines around it (15 s
// page + 10 s hero image + 10 s poster), so the longest processItem run ends
// in about 100 s, far under both the action limit and PROCESSING_STALE_MS.
// One retry on retryable provider errors (429/5xx). The default of 2 would let
// a flaky provider triple the wall-clock spend inside a single deadline.
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

/** True for the error a timed-out or aborted model call rejects with. The SDK
 * rethrows the raw signal reason (a DOMException named TimeoutError for
 * AbortSignal.timeout, AbortError for a manual abort). Checked by name so the
 * error's message (which can echo the request) is never inspected. */
export function isModelTimeout(error: unknown): boolean {
  return (
    error !== null &&
    typeof error === "object" &&
    "name" in error &&
    (error.name === "TimeoutError" || error.name === "AbortError")
  );
}
