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
}: {
  entitlement?: string;
  productId?: string;
  expiresAt?: number;
  graceUntil?: number;
  periodType?: string;
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
        ? { [productId]: { period_type: periodType } }
        : {},
    },
  };
}

export function stubRevenueCatFetch(body: unknown) {
  const fetchMock = vi.fn().mockImplementation(async () => Response.json(body));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

// The module map lets convex-test discover and load function files.
const modules = import.meta.glob("./**/*.ts");

/**
 * Build a convex-test instance with the rate-limiter component registered.
 * Every test must go through this: mutations that call `rateLimiter.limit`
 * fail with "Component not registered" against a bare `convexTest(schema, ...)`.
 */
export function newConvexTest() {
  const t = convexTest(schema, modules);
  registerRateLimiter(t);
  return t;
}

export type TestBackend = ReturnType<typeof newConvexTest>;

/**
 * A signed-in identity backed by a real users row. `requireUserId` rejects an
 * identity whose owner row is missing or mid-deletion, so a made-up subject
 * cannot authorize anything; tests take the row's id from here and use it for
 * the data they seed. `pro` adds an active subscription, which every save and
 * Pro feature is gated on. `session` adds a real `authSessions` row and makes
 * it the subject's session suffix, for tests that assert auth-table cleanup.
 */
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

/** `count` ready note items for `userId`, the payload deletion tests use to
 * keep an account mid-deletion past the first batch. */
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

/**
 * A one-shot barrier for race tests. Hand `hold` to the seam under test (a
 * stubbed fetch, an exchange): when the code reaches it, `reached` resolves
 * and the seam waits; the test then arranges the racing state and calls
 * `open()`, and `hold` resolves with its value. Single use: arm a fresh gate
 * per held call.
 */
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
