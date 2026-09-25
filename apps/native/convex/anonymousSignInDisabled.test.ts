// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { afterEach, describe, expect, it, vi } from "vitest";

import { api } from "./_generated/api";
import { newConvexTest } from "./test.setup";

afterEach(() => {
  vi.unstubAllEnvs();
});

// convex/auth.ts pins its provider list at module load, so the enabled
// branch lives in anonymousSignIn.test.ts. The second test proves a flag
// flip after first load still sees the pinned list.
describe("anonymous sign-in with AUTH_ENABLE_ANONYMOUS unset", () => {
  it("is rejected by the server before any account is created", async () => {
    vi.stubEnv("AUTH_ENABLE_ANONYMOUS", undefined);
    const backend = newConvexTest();

    await expect(
      backend.action(api.auth.signIn, { provider: "anonymous" }),
    ).rejects.toThrow(/Provider `anonymous` is not configured/);

    const users = await backend.run((ctx) => ctx.db.query("users").collect());
    const accounts = await backend.run((ctx) =>
      ctx.db.query("authAccounts").collect(),
    );
    expect(users).toHaveLength(0);
    expect(accounts).toHaveLength(0);
  });

  it("stays rejected when the env flips after auth.ts has loaded in this file", async () => {
    vi.stubEnv("AUTH_ENABLE_ANONYMOUS", "true");
    const backend = newConvexTest();

    await expect(
      backend.action(api.auth.signIn, { provider: "anonymous" }),
    ).rejects.toThrow(/Provider `anonymous` is not configured/);
  });
});
