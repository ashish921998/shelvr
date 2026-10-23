import { convexTest } from "convex-test";
import { register as registerRateLimiter } from "@convex-dev/rate-limiter/test";
import type { Id } from "./_generated/dataModel";
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

export async function signedInUser(
  backend: TestBackend,
  options: { email?: string; pro?: boolean; session?: boolean } = {},
): Promise<{
  userId: Id<"users">;
  sessionId: Id<"authSessions"> | undefined;
  t: ReturnType<TestBackend["withIdentity"]>;
}> {
  const { userId, sessionId } = await backend.run(async (ctx) => {
    const userId = await ctx.db.insert(
      "users",
      options.email === undefined ? {} : { email: options.email },
    );
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
