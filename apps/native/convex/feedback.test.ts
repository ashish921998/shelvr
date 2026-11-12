// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { afterEach, describe, expect, it, vi } from "vitest";

import { api, internal } from "./_generated/api";
import {
  FEEDBACK_MESSAGE_MAX_LENGTH,
  MAX_DELIVERY_ATTEMPTS,
  isFeedbackInboxConfigured,
} from "./feedback";
import { classifyResendError, formatResendError } from "./model/resend";
import { gate, newConvexTest, signedInUser } from "./test.setup";
import type { Id } from "./_generated/dataModel";

const INBOX = "support@shelvr.app";
const SENDER = "feedback@shelvr.app";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function setup() {
  vi.stubEnv("RESEND_API_KEY", "re_test_key");
  vi.stubEnv("RESEND_FEEDBACK_INBOX_EMAIL", INBOX);
  vi.stubEnv("RESEND_FEEDBACK_FROM_EMAIL", SENDER);
  return newConvexTest();
}

async function signedInWithEmail(
  t: ReturnType<typeof newConvexTest>,
  email?: string,
) {
  return await signedInUser(t, {
    email,
    session: true,
  });
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
      userId: fields.userId ?? (await ctx.db.insert("users", {})),
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
  it("reclaims expired deliveries without accepting an older attempt's failure", async () => {
    vi.useFakeTimers();
    const t = setup();
    const submissionId = await insertSubmission(t, {});
    const first = await t.mutation(internal.feedback.claimDelivery, {
      submissionId,
    });
    expect(
      await t.mutation(internal.feedback.claimDelivery, { submissionId }),
    ).toBeNull();
    vi.setSystemTime(Date.now() + 90_001);
    const second = await t.mutation(internal.feedback.claimDelivery, {
      submissionId,
    });
    expect(second?.attempt).toBe(2);
    await t.mutation(internal.feedback.finishDelivery, {
      submissionId,
      attempt: first?.attempt,
      status: "failed",
    });
    expect(
      (await getSubmission(t, submissionId))?.deliveryLeaseUntil,
    ).toBeGreaterThan(Date.now());
    await t.mutation(internal.feedback.finishDelivery, {
      submissionId,
      attempt: second?.attempt,
      status: "delivered",
    });
    expect(await getSubmission(t, submissionId)).toMatchObject({
      status: "delivered",
    });
    expect(
      (await getSubmission(t, submissionId))?.deliveryRequestBody,
    ).toBeUndefined();
  });

  it("retries an uncertain send with the same key and body after account or inbox changes", async () => {
    const t = setup();
    const { userId } = await signedInWithEmail(t, "before@example.com");
    const submissionId = await insertSubmission(t, { userId });
    const fetch = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("connection lost"))
      .mockResolvedValue(Response.json({ id: "same-email" }));
    vi.stubGlobal("fetch", fetch);
    await t.action(internal.feedback.deliver, { submissionId });
    await t.run((ctx) => ctx.db.patch(userId, { email: "after@example.com" }));
    vi.stubEnv("RESEND_FEEDBACK_INBOX_EMAIL", "different@example.com");
    await t.action(internal.feedback.deliver, { submissionId });
    const first: RequestInit = fetch.mock.calls[0][1];
    const second: RequestInit = fetch.mock.calls[1][1];
    expect(new Headers(first.headers).get("Idempotency-Key")).toBe(
      `feedback/${submissionId}`,
    );
    expect(new Headers(second.headers).get("Idempotency-Key")).toBe(
      new Headers(first.headers).get("Idempotency-Key"),
    );
    expect(second.body).toBe(first.body);
    expect(await getSubmission(t, submissionId)).toMatchObject({
      status: "delivered",
      attempts: 2,
    });
  });

  it("does not resend an uncertain delivery after the provider's deduplication window", async () => {
    vi.useFakeTimers();
    const t = setup();
    const submissionId = await insertSubmission(t, {});
    await t.mutation(internal.feedback.claimDelivery, { submissionId });
    vi.setSystemTime(Date.now() + 24 * 60 * 60_000);
    const fetch = okFetch();
    vi.stubGlobal("fetch", fetch);
    await t.action(internal.feedback.deliver, { submissionId });
    expect(fetch).not.toHaveBeenCalled();
    expect(await getSubmission(t, submissionId)).toMatchObject({
      status: "expired",
      attempts: 1,
    });
    expect(
      (await getSubmission(t, submissionId))?.deliveryRequestBody,
    ).toBeUndefined();
    expect(
      await t.query(internal.feedback.listSubmissionsNeedingDelivery, {}),
    ).not.toContain(submissionId);
  });

  it("sends once when recovery overlaps a delivery already in flight", async () => {
    const t = setup();
    const submissionId = await insertSubmission(t, {});
    const sending = gate();
    const fetch = vi
      .fn()
      .mockImplementationOnce(() =>
        sending.hold(Response.json({ id: "email" })),
      )
      .mockResolvedValue(Response.json({ id: "email" }));
    vi.stubGlobal("fetch", fetch);
    const first = t.action(internal.feedback.deliver, { submissionId });
    await sending.reached;
    const candidates = await t.query(
      internal.feedback.listSubmissionsNeedingDelivery,
      {},
    );
    if (candidates.includes(submissionId))
      await t.action(internal.feedback.deliver, { submissionId });
    sending.open();
    await first;
    expect(fetch).toHaveBeenCalledOnce();
  });
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
      attempts: 1,
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
    expect(body.text).toContain("Love the app");
    expect(body.subject).toBe("Shelvr feedback (home)");
    expect(body.subject).not.toContain("Love the app");
  });

  it("rejects empty and over-long messages instead of truncating them", async () => {
    const t = setup();
    const { t: signedIn } = await signedInWithEmail(t);
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
    const t = newConvexTest();
    const { t: signedIn } = await signedInWithEmail(t);
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
    const { t: signedIn } = await signedInWithEmail(t);
    const args = { message: "hi", surface: "profile" as const };
    await signedIn.mutation(api.feedback.submitFeedback, args);
    await signedIn.mutation(api.feedback.submitFeedback, args);
    await signedIn.mutation(api.feedback.submitFeedback, args);
    await expect(
      signedIn.mutation(api.feedback.submitFeedback, args),
    ).rejects.toThrow();
  });

  it("keeps the row for retry when the inbox is not configured", async () => {
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

    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    vi.stubEnv("RESEND_FEEDBACK_INBOX_EMAIL", INBOX);
    vi.stubEnv("RESEND_FEEDBACK_FROM_EMAIL", SENDER);
    expect(isFeedbackInboxConfigured()).toBe(true);
    await t.action(internal.feedback.retryFailedDeliveries, {});
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(await getSubmission(t, result.submissionId)).toMatchObject({
      status: "delivered",
      attempts: 1,
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

    expect(await getSubmission(t, result.submissionId)).toMatchObject({
      status: "failed",
      attempts: 1,
      deliveryError: "provider_error:500",
    });

    const logged = errorSpy.mock.calls
      .map((call) => String(call[0]))
      .join("\n");
    expect(logged).toContain("feedback_delivery_failed");
    expect(logged).toContain("provider_error");
    expect(logged).not.toContain("secret words");
    expect(logged).not.toContain("person@example.com");

    fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));
    await t.action(internal.feedback.retryFailedDeliveries, {});
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(await getSubmission(t, result.submissionId)).toMatchObject({
      status: "delivered",
      attempts: 2,
    });
  });

  it("retries active rows and closes capped rows without sending them", async () => {
    const t = setup();
    const fetchMock = okFetch();
    vi.stubGlobal("fetch", fetchMock);
    vi.useFakeTimers();

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
    expect(due).toContain(capped);

    await t.action(internal.feedback.retryFailedDeliveries, {});
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(fetchMock).toHaveBeenCalledTimes(3);
    for (const id of [pending, failed, unconfigured]) {
      expect(await getSubmission(t, id)).toMatchObject({ status: "delivered" });
    }
    expect(await getSubmission(t, capped)).toMatchObject({
      status: "exhausted",
      attempts: MAX_DELIVERY_ATTEMPTS,
    });
  });

  it("stops retrying a row once the attempt cap is reached", async () => {
    vi.useFakeTimers();
    const t = setup();
    const fetchMock = okFetch();
    vi.stubGlobal("fetch", fetchMock);
    const capped = await insertSubmission(t, {
      status: "failed",
      attempts: MAX_DELIVERY_ATTEMPTS,
    });

    await t.action(internal.feedback.retryFailedDeliveries, {});
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(await getSubmission(t, capped)).toMatchObject({
      status: "exhausted",
      attempts: MAX_DELIVERY_ATTEMPTS,
    });
  });

  it("spends the attempt at claim time, so a crashed send still counts", async () => {
    const t = setup();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const id = await insertSubmission(t, { status: "pending" });

    const claimed = await t.mutation(internal.feedback.claimDelivery, {
      submissionId: id,
    });
    expect(claimed).toEqual({ attempt: 1, body: expect.any(String) });
    expect(JSON.parse(claimed!.body).text).toContain("seeded");
    expect(await getSubmission(t, id)).toMatchObject({
      status: "pending",
      attempts: 1,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("delivery snapshot ownership", () => {
  it("clears a crashed final attempt after its lease expires", async () => {
    vi.useFakeTimers();
    const t = setup();
    const submissionId = await insertSubmission(t, {
      attempts: MAX_DELIVERY_ATTEMPTS - 1,
    });
    await t.mutation(internal.feedback.claimDelivery, { submissionId });
    const fetch = okFetch();
    vi.stubGlobal("fetch", fetch);
    await t.action(internal.feedback.retryFailedDeliveries, {});
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(
      (await getSubmission(t, submissionId))?.deliveryRequestBody,
    ).toBeDefined();
    vi.setSystemTime(Date.now() + 90_001);
    await t.action(internal.feedback.retryFailedDeliveries, {});
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const row = await getSubmission(t, submissionId);
    expect(row).toMatchObject({
      status: "exhausted",
      attempts: MAX_DELIVERY_ATTEMPTS,
    });
    expect(row?.deliveryRequestBody).toBeUndefined();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("migrates an earlier request snapshot without rebuilding it", async () => {
    const t = setup();
    const submissionId = await insertSubmission(t, {});
    const body = JSON.stringify({
      from: SENDER,
      to: INBOX,
      subject: "old",
      text: "original",
    });
    await t.run((ctx) => ctx.db.patch(submissionId, { deliveryEmail: body }));
    const claimed = await t.mutation(internal.feedback.claimDelivery, {
      submissionId,
    });
    expect(claimed).toEqual({ attempt: 1, body });
    const row = await getSubmission(t, submissionId);
    expect(row?.deliveryRequestBody).toBe(body);
    expect(row?.deliveryEmail).toBeUndefined();
    await t.mutation(internal.feedback.finishDelivery, {
      submissionId,
      attempt: 1,
      status: "delivered",
    });
    const delivered = await getSubmission(t, submissionId);
    expect(delivered?.deliveryRequestBody).toBeUndefined();
    expect(delivered?.deliveryEmail).toBeUndefined();
  });

  it("clears snapshots when a failed attempt exhausts delivery", async () => {
    const t = setup();
    const submissionId = await insertSubmission(t, {
      attempts: MAX_DELIVERY_ATTEMPTS - 1,
    });
    vi.stubGlobal("fetch", statusFetch(500));
    await t.action(internal.feedback.deliver, { submissionId });
    const row = await getSubmission(t, submissionId);
    expect(row).toMatchObject({
      status: "exhausted",
      attempts: MAX_DELIVERY_ATTEMPTS,
    });
    expect(row?.deliveryRequestBody).toBeUndefined();
    expect(row?.deliveryEmail).toBeUndefined();
    expect(
      await t.query(internal.feedback.listSubmissionsNeedingDelivery, {}),
    ).not.toContain(submissionId);
  });

  it("discards a pre-deploy completion without finishing the current attempt", async () => {
    const t = setup();
    const submissionId = await insertSubmission(t, {});
    await t.mutation(internal.feedback.claimDelivery, { submissionId });
    const before = await getSubmission(t, submissionId);
    await t.mutation(internal.feedback.finishDelivery, {
      submissionId,
      status: "delivered",
    });
    expect(await getSubmission(t, submissionId)).toEqual(before);
  });
});

describe("account deletion", () => {
  it("never sends feedback once its owner has started deleting the account", async () => {
    const t = setup();
    const fetchMock = okFetch();
    vi.stubGlobal("fetch", fetchMock);
    const userId = await t.run(async (ctx) =>
      ctx.db.insert("users", { email: "gone@example.com", deleting: true }),
    );
    const id = await insertSubmission(t, { userId, status: "failed" });

    await t.action(internal.feedback.deliver, { submissionId: id });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(await getSubmission(t, id)).toBeNull();
  });

  it("never sends feedback whose owner row is already gone", async () => {
    const t = setup();
    const fetchMock = okFetch();
    vi.stubGlobal("fetch", fetchMock);
    const userId = await t.run(async (ctx) => {
      const id = await ctx.db.insert("users", {});
      await ctx.db.delete(id);
      return id;
    });
    const id = await insertSubmission(t, { userId, status: "pending" });

    await t.action(internal.feedback.deliver, { submissionId: id });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(await getSubmission(t, id)).toBeNull();
  });

  it("keeps retrying a live owner's feedback behind many from deleting accounts", async () => {
    const t = setup();
    vi.useFakeTimers();
    const fetchMock = okFetch();
    vi.stubGlobal("fetch", fetchMock);
    await t.run(async (ctx) => {
      for (let i = 0; i < 101; i++) {
        const owner = await ctx.db.insert("users", { deleting: true });
        await ctx.db.insert("feedbackSubmissions", {
          userId: owner,
          message: "from a deleting account",
          surface: "home",
          status: "failed",
          attempts: 0,
        });
      }
    });
    const live = await insertSubmission(t, { status: "failed", attempts: 1 });

    await t.action(internal.feedback.retryFailedDeliveries, {});
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    await t.action(internal.feedback.retryFailedDeliveries, {});
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(await getSubmission(t, live)).toMatchObject({ status: "delivered" });
  });
});

describe("classifyResendError", () => {
  it("maps non-HTTP failures to a bounded category", () => {
    expect(
      classifyResendError(new TypeError("fetch failed"), "invalid_request"),
    ).toEqual({
      category: "network_error",
      status: undefined,
    });
    expect(
      classifyResendError(
        new DOMException("aborted", "AbortError"),
        "invalid_request",
      ),
    ).toEqual({ category: "timeout", status: undefined });
    expect(classifyResendError("string", "invalid_request")).toEqual({
      category: "network_error",
      status: undefined,
    });
    expect(formatResendError("provider_error", 500)).toBe("provider_error:500");
    expect(formatResendError("timeout", undefined)).toBe("timeout");
  });

  it("maps provider statuses into fixed categories", async () => {
    const t = setup();
    const fetchMock = statusFetch(429);
    vi.stubGlobal("fetch", fetchMock);
    vi.useFakeTimers();
    const id = await insertSubmission(t, { status: "pending" });

    await t.action(internal.feedback.retryFailedDeliveries, {});
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(await getSubmission(t, id)).toMatchObject({
      status: "failed",
      attempts: 1,
      deliveryError: "rate_limited:429",
    });
  });
});
