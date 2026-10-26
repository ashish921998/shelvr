import { convexTest } from "convex-test";
import { register as registerRateLimiter } from "@convex-dev/rate-limiter/test";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { AI_CONSENT_VERSION } from "./model/aiConsent";
import schema from "./schema";
import { vi } from "vitest";

export function revenuecatSnapshot({
  entitlement = "Shelvr Pro",
  productId,
  expiresAt = Date.now() + 60_000,
  graceUntil,
  periodType = "normal",
  store,
}: {
  entitlement?: string;
  productId?: string;
  expiresAt?: number;
  graceUntil?: number;
  periodType?: string;
  store?: string;
} = {}) {
  return {
    request_date_ms: Date.now(),
    subscriber: {
      entitlements: productId
        ? {
            [entitlement]: {
              product_identifier: productId,
              expires_date: new Date(expiresAt).toISOString(),
              ...(graceUntil === undefined
                ? {}
                : {
                    grace_period_expires_date: new Date(
                      graceUntil,
                    ).toISOString(),
                  }),
            },
          }
        : {},
      subscriptions: productId
        ? { [productId]: { period_type: periodType, store } }
        : {},
    },
  };
}

export function stubRevenueCatFetch(body: unknown) {
  const fetchMock = vi.fn().mockImplementation(async () => Response.json(body));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const modules = import.meta.glob("./**/*.ts");

export function newConvexTest() {
  const t = convexTest(schema, modules);
  registerRateLimiter(t);
  return t;
}

export type TestBackend = ReturnType<typeof newConvexTest>;

/** A users row that has chosen Allow on the Gemini ask, as every account must before AI runs. */
export async function insertConsentingUser(
  ctx: MutationCtx,
  fields: { email?: string } = {},
): Promise<Id<"users">> {
  const userId = await ctx.db.insert("users", fields);
  await ctx.db.insert("aiConsents", {
    userId,
    status: "granted",
    version: AI_CONSENT_VERSION,
    updatedAt: Date.now(),
  });
  return userId;
}

/** Replaces the account's Gemini answer, as setConsent would. */
export async function setTestConsent(
  ctx: MutationCtx,
  userId: string,
  status: "granted" | "declined",
  version: number = AI_CONSENT_VERSION,
): Promise<void> {
  const row = await ctx.db
    .query("aiConsents")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .unique();
  const values = { status, version, updatedAt: Date.now() };
  if (row === null) await ctx.db.insert("aiConsents", { userId, ...values });
  else await ctx.db.patch(row._id, values);
}

export async function signedInUser(
  backend: TestBackend,
  options: {
    email?: string;
    pro?: boolean;
    session?: boolean;
    aiConsent?: "granted" | "unset";
  } = {},
): Promise<{
  userId: Id<"users">;
  sessionId: Id<"authSessions"> | undefined;
  t: ReturnType<TestBackend["withIdentity"]>;
}> {
  const { userId, sessionId } = await backend.run(async (ctx) => {
    const fields = options.email === undefined ? {} : { email: options.email };
    const userId =
      options.aiConsent === "unset"
        ? await ctx.db.insert("users", fields)
        : await insertConsentingUser(ctx, fields);
    const sessionId =
      options.session === true
        ? await ctx.db.insert("authSessions", {
            userId,
            expirationTime: Date.now() + 60_000,
          })
        : undefined;
    if (options.pro === true) {
      await ctx.db.insert("subscriptions", {
        userId,
        status: "pro",
        expiresAt: Date.now() + 365 * 24 * 60 * 60 * 1000,
        updatedAt: Date.now(),
      });
    }
    return { userId, sessionId };
  });
  return {
    userId,
    sessionId,
    t: backend.withIdentity({
      subject: `${userId}|${sessionId ?? "session-1"}`,
    }),
  };
}

export async function seedNotes(
  backend: Pick<TestBackend, "run">,
  userId: Id<"users">,
  count: number,
): Promise<void> {
  await backend.run(async (ctx) => {
    for (let i = 0; i < count; i++) {
      await ctx.db.insert("items", {
        userId,
        type: "note",
        status: "ready",
        tags: [],
        searchText: `note ${i}`,
        note: `note ${i}`,
      });
    }
  });
}

export function gate(): {
  reached: Promise<void>;
  open(): void;
  hold<T>(value: T): Promise<T>;
} {
  let arrived!: () => void;
  let release!: () => void;
  const reached = new Promise<void>((resolve) => {
    arrived = resolve;
  });
  const opened = new Promise<void>((resolve) => {
    release = resolve;
  });
  return {
    reached,
    open: release,
    async hold<T>(value: T): Promise<T> {
      arrived();
      await opened;
      return value;
    },
  };
}
