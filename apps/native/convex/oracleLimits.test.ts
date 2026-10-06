// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { isRateLimitError } from "@convex-dev/rate-limiter";
import { afterEach, describe, expect, it, vi } from "vitest";
import { internal } from "./_generated/api";
import { WAITLIST_CLIENT_IP_HEADER, WAITLIST_SECRET_HEADER } from "./http";
import { newConvexTest } from "./test.setup";

const SECRET = "oracle-test-secret";
const IP = "203.0.113.7";

afterEach(() => {
  vi.unstubAllEnvs();
});

function claim(t: ReturnType<typeof newConvexTest>, ip: string) {
  return t.mutation(internal.oracleLimits.claim, { ip });
}

function consult(
  t: ReturnType<typeof newConvexTest>,
  body: unknown,
  secret = SECRET,
) {
  return t.fetch("/oracle", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      [WAITLIST_SECRET_HEADER]: secret,
      [WAITLIST_CLIENT_IP_HEADER]: IP,
    },
    body: JSON.stringify(body),
  });
}

describe("oracleLimits.claim", () => {
  it("limits parsing budgets independently of Oracle model usage", async () => {
    const t = newConvexTest();
    for (let i = 0; i < 12; i++) {
      await t.mutation(internal.oracleLimits.claimRequestBody, {
        ip: IP,
        route: "oracle",
      });
    }
    await expect(
      t.mutation(internal.oracleLimits.claimRequestBody, {
        ip: IP,
        route: "oracle",
      }),
    ).rejects.toThrow();
    await expect(
      t.mutation(internal.oracleLimits.claimRequestBody, {
        ip: IP,
        route: "waitlist",
      }),
    ).resolves.toBeNull();
    await expect(claim(t, IP)).resolves.toBeNull();
  });

  it("authenticates parsing-budget requests before any body is read", async () => {
    vi.stubEnv("WAITLIST_SHARED_SECRET", SECRET);
    const t = newConvexTest();
    expect((await t.fetch("/request-body", { method: "POST" })).status).toBe(
      401,
    );
    expect(
      (
        await t.fetch("/request-body", {
          method: "POST",
          headers: {
            [WAITLIST_SECRET_HEADER]: SECRET,
            "x-shelvr-body-route": "unknown",
          },
        })
      ).status,
    ).toBe(400);
    const headers = {
      [WAITLIST_SECRET_HEADER]: SECRET,
      "x-shelvr-body-route": "oracle",
      [WAITLIST_CLIENT_IP_HEADER]: IP,
    };
    for (let i = 0; i < 12; i++)
      expect(
        (await t.fetch("/request-body", { method: "POST", headers })).status,
      ).toBe(200);
    expect(
      (await t.fetch("/request-body", { method: "POST", headers })).status,
    ).toBe(429);
  });
  it("stops the fifth consult from one IP within the hour", async () => {
    const t = newConvexTest();

    for (let i = 0; i < 4; i++) {
      await expect(claim(t, IP)).resolves.toBeNull();
    }
    const fifth = await claim(t, IP).then(
      () => undefined,
      (error: unknown) => error,
    );
    expect(isRateLimitError(fifth)).toBe(true);

    await expect(claim(t, "198.51.100.9")).resolves.toBeNull();
  });
});

describe("POST /oracle", () => {
  const tabs = { kind: "tabs", count: 12, titles: [] };

  it("rejects a caller without the shared secret", async () => {
    vi.stubEnv("WAITLIST_SHARED_SECRET", SECRET);
    const t = newConvexTest();
    const response = await consult(t, tabs, "wrong");
    expect(response.status).toBe(401);
  });

  it("answers a malformed body with 400 without spending a token", async () => {
    vi.stubEnv("WAITLIST_SHARED_SECRET", SECRET);
    const t = newConvexTest();
    for (let i = 0; i < 5; i++) {
      const response = await consult(t, { kind: "links", urls: [] });
      expect(response.status).toBe(400);
    }
    for (let i = 0; i < 4; i++) {
      await expect(claim(t, IP)).resolves.toBeNull();
    }
  });

  it("answers 429 once the visitor's bucket is empty", async () => {
    vi.stubEnv("WAITLIST_SHARED_SECRET", SECRET);
    const t = newConvexTest();
    for (let i = 0; i < 4; i++) {
      await claim(t, IP);
    }
    const response = await consult(t, tabs);
    expect(response.status).toBe(429);
  });
});
