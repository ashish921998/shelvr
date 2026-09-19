// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { afterEach, describe, expect, it, vi } from "vitest";

import { api, internal } from "./_generated/api";
import {
  FEEDBACK_MESSAGE_MAX_LENGTH,
  MAX_DELIVERY_ATTEMPTS,
  classifyFeedbackSendError,
  formatFeedbackError,
  isFeedbackInboxConfigured,
} from "./feedback";
import { newConvexTest } from "./test.setup";
import type { Id } from "./_generated/dataModel";

const INBOX = "support@shelvr.app";
const SENDER = "feedback@shelvr.app";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

/** Inbox env stubbed + a fresh test instance. */
function setup() {
  vi.stubEnv("RESEND_API_KEY", "re_test_key");
  vi.stubEnv("RESEND_FEEDBACK_INBOX_EMAIL", INBOX);
  vi.stubEnv("RESEND_FEEDBACK_FROM_EMAIL", SENDER);
  return newConvexTest();
}

/** A synthetic subject identity; the users row only needs to exist when the
 * test asserts on the account email. */
function as(t: ReturnType<typeof newConvexTest>, userId: string) {
  return t.withIdentity({ subject: `${userId}|session-1` });
}

/** A real users row + session so claimDelivery can read the account email. */
async function signedInWithEmail(
  t: ReturnType<typeof newConvexTest>,
  email?: string,
) {
  const userId = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", email ? { email } : {});
    await ctx.db.insert("authSessions", {
      userId,
      expirationTime: Date.now() + 60_000,
    });
    return userId;
  });
  return { t: as(t, userId as string), userId: userId as string };
}

function okFetch() {
  return vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
}

function statusFetch(status: number) {
  return vi.fn().mockResolvedValue(new Response("nope", { status }));
}

async function insertSubmission(
  t: ReturnType<typeof newConvexTest>,
  fields: Partial<{
    userId: string;
    message: string;
    surface: "home" | "profile";
    status: "pending" | "unconfigured" | "delivered" | "failed";
    attempts: number;
  }>,
): Promise<Id<"feedbackSubmissions">> {
  return await t.run(async (ctx) =>
    ctx.db.insert("feedbackSubmissions", {
      userId: fields.userId ?? "user-seed",
      message: fields.message ?? "seeded",
      surface: fields.surface ?? "home",
      status: fields.status ?? "pending",
      attempts: fields.attempts ?? 0,
    }),
  );
}

async function getSubmission(
  t: ReturnType<typeof newConvexTest>,
  id: Id<"feedbackSubmissions">,
) {
  return await t.run(async (ctx) => ctx.db.get(id));
}

describe("submitFeedback", () => {
  it("rejects unauthenticated callers", async () => {
    const t = setup();
    await expect(
      t.mutation(api.feedback.submitFeedback, {
        message: "hi",
        surface: "home",
      }),
    ).rejects.toThrow(/Not authenticated/);
  });

  it("persists one authenticated row and delivers it to the inbox", async () => {
    const t = setup();
    const fetchMock = okFetch();
    vi.stubGlobal("fetch", fetchMock);
    vi.useFakeTimers();
    const { t: signedIn, userId } = await signedInWithEmail(
      t,
      "person@example.com",
    );

    const result = await signedIn.mutation(api.feedback.submitFeedback, {
      message: "  Love the app  ",
      surface: "home",
      platform: "ios",
      appVersion: "1.2.3",
      buildVariant: "production",
    });

    expect(result.deliveryState).toBe("scheduled");
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const row = await getSubmission(t, result.submissionId);
    expect(row).toMatchObject({
      userId,
      message: "Love the app",
      surface: "home",
      platform: "ios",
      appVersion: "1.2.3",
      buildVariant: "production",
      status: "delivered",
      attempts: 0,
    });
    expect(row?.deliveredAt).toBeGreaterThan(0);

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [
      string,
      RequestInit & { headers: Record<string, string> },
    ];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.headers.Authorization).toBe("Bearer re_test_key");
    expect(init.signal).toBeInstanceOf(AbortSignal);
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({ to: INBOX, from: SENDER });
    expect(body.reply_to).toBe("person@example.com");
    // The message is authorized in the email body, but the subject stays
    // content-free so notification previews cannot leak it.
    expect(body.text).toContain("Love the app");
    expect(body.subject).toBe("Shelvr feedback (home)");
    expect(body.subject).not.toContain("Love the app");
  });

  it("rejects empty and over-long messages instead of truncating them", async () => {
    const t = setup();
    const signedIn = as(t, "user-validate");
    await expect(
      signedIn.mutation(api.feedback.submitFeedback, {
        message: "   ",
        surface: "home",
      }),
    ).rejects.toThrow(/empty/);
    await expect(
      signedIn.mutation(api.feedback.submitFeedback, {
        message: "a".repeat(FEEDBACK_MESSAGE_MAX_LENGTH + 1),
        surface: "home",
      }),
    ).rejects.toThrow(/too long/);
  });

  it("bounds the context strings it stores", async () => {
    // No inbox env: nothing is scheduled, so the row can be inspected without
    // a delivery action pending behind the test.
    const t = newConvexTest();
    const signedIn = as(t, "user-context");
    const result = await signedIn.mutation(api.feedback.submitFeedback, {
      message: "hello",
      surface: "profile",
      appVersion: "x".repeat(200),
      buildVariant: "   ",
    });
    const row = await getSubmission(t, result.submissionId);
    expect(row?.appVersion?.length).toBe(64);
    expect(row?.buildVariant).toBeUndefined();
  });

  it("rate limits rapid submissions per user", async () => {
    const t = newConvexTest();
    const signedIn = as(t, "user-rate");
    const args = { message: "hi", surface: "profile" as const };
    await signedIn.mutation(api.feedback.submitFeedback, args);
    await signedIn.mutation(api.feedback.submitFeedback, args);
    await signedIn.mutation(api.feedback.submitFeedback, args);
    await expect(
      signedIn.mutation(api.feedback.submitFeedback, args),
    ).rejects.toThrow();
  });

  it("keeps the row for retry when the inbox is not configured", async () => {
    // No env stubs: nothing is configured, so nothing is scheduled.
    const t = newConvexTest();
    const fetchMock = okFetch();
    vi.stubGlobal("fetch", fetchMock);
    vi.useFakeTimers();
    const { t: signedIn } = await signedInWithEmail(t, "person@example.com");

    const result = await signedIn.mutation(api.feedback.submitFeedback, {
      message: "please read this later",
      surface: "profile",
    });

    expect(result.deliveryState).toBe("unconfigured");
    expect(fetchMock).not.toHaveBeenCalled();
    const row = await getSubmission(t, result.submissionId);
    expect(row).toMatchObject({ status: "unconfigured", attempts: 0 });

    // The operator configures the inbox; the retry worker delivers the
    // waiting row without spending an attempt on the unconfigured window.
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    vi.stubEnv("RESEND_FEEDBACK_INBOX_EMAIL", INBOX);
    vi.stubEnv("RESEND_FEEDBACK_FROM_EMAIL", SENDER);
    expect(isFeedbackInboxConfigured()).toBe(true);
    await t.action(internal.feedback.retryFailedDeliveries, {});
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(await getSubmission(t, result.submissionId)).toMatchObject({
      status: "delivered",
      attempts: 0,
    });
  });
});

describe("delivery retries", () => {
  it("keeps a failed send for bounded retry without logging user content", async () => {
    const t = setup();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchMock = statusFetch(500);
    vi.stubGlobal("fetch", fetchMock);
    vi.useFakeTimers();
    const { t: signedIn } = await signedInWithEmail(t, "person@example.com");

    const result = await signedIn.mutation(api.feedback.submitFeedback, {
      message: "secret words",
      surface: "profile",
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    // The row survives the outage, ready for the retry worker.
    expect(await getSubmission(t, result.submissionId)).toMatchObject({
      status: "failed",
      attempts: 1,
      deliveryError: "provider_error:500",
    });

    // The log line carries category/status/attempt only — never the message
    // or the account email.
    const logged = errorSpy.mock.calls
      .map((call) => String(call[0]))
      .join("\n");
    expect(logged).toContain("feedback_delivery_failed");
    expect(logged).toContain("provider_error");
    expect(logged).not.toContain("secret words");
    expect(logged).not.toContain("person@example.com");

    // The provider recovers; the retry worker delivers the same row.
    fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));
    await t.action(internal.feedback.retryFailedDeliveries, {});
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(await getSubmission(t, result.submissionId)).toMatchObject({
      status: "delivered",
      attempts: 1,
    });
  });

  it("retries pending, failed, and unconfigured rows but never a delivered or capped one", async () => {
    const t = setup();
    const fetchMock = okFetch();
    vi.stubGlobal("fetch", fetchMock);

    const pending = await insertSubmission(t, { status: "pending" });
    const failed = await insertSubmission(t, {
      status: "failed",
      attempts: 2,
    });
    const unconfigured = await insertSubmission(t, {
      status: "unconfigured",
    });
    const delivered = await insertSubmission(t, {
      status: "delivered",
      attempts: 0,
    });
    const capped = await insertSubmission(t, {
      status: "failed",
      attempts: MAX_DELIVERY_ATTEMPTS,
    });

    const due = await t.query(
      internal.feedback.listSubmissionsNeedingDelivery,
      {},
    );
    expect(due).toContain(pending);
    expect(due).toContain(failed);
    expect(due).toContain(unconfigured);
    expect(due).not.toContain(delivered);
    expect(due).not.toContain(capped);

    await t.action(internal.feedback.retryFailedDeliveries, {});

    expect(fetchMock).toHaveBeenCalledTimes(3);
    for (const id of [pending, failed, unconfigured]) {
      expect(await getSubmission(t, id)).toMatchObject({ status: "delivered" });
    }
    expect(await getSubmission(t, capped)).toMatchObject({
      status: "failed",
      attempts: MAX_DELIVERY_ATTEMPTS,
    });
  });

  it("stops retrying a row once the attempt cap is reached", async () => {
    const t = setup();
    const fetchMock = okFetch();
    vi.stubGlobal("fetch", fetchMock);
    const capped = await insertSubmission(t, {
      status: "failed",
      attempts: MAX_DELIVERY_ATTEMPTS,
    });

    await t.action(internal.feedback.retryFailedDeliveries, {});

    expect(fetchMock).not.toHaveBeenCalled();
    expect(await getSubmission(t, capped)).toMatchObject({
      status: "failed",
      attempts: MAX_DELIVERY_ATTEMPTS,
    });
  });
});

describe("classifyFeedbackSendError", () => {
  it("maps non-HTTP failures to a bounded category", () => {
    expect(classifyFeedbackSendError(new TypeError("fetch failed"))).toEqual({
      category: "network_error",
      status: undefined,
    });
    expect(
      classifyFeedbackSendError(new DOMException("aborted", "AbortError")),
    ).toEqual({ category: "timeout", status: undefined });
    expect(classifyFeedbackSendError("string")).toEqual({
      category: "network_error",
      status: undefined,
    });
    expect(formatFeedbackError("provider_error", 500)).toBe(
      "provider_error:500",
    );
    expect(formatFeedbackError("timeout", undefined)).toBe("timeout");
  });

  it("maps provider statuses into fixed categories", async () => {
    const t = setup();
    const fetchMock = statusFetch(429);
    vi.stubGlobal("fetch", fetchMock);
    const id = await insertSubmission(t, { status: "pending" });

    await t.action(internal.feedback.retryFailedDeliveries, {});

    expect(await getSubmission(t, id)).toMatchObject({
      status: "failed",
      attempts: 1,
      deliveryError: "rate_limited:429",
    });
  });
});
