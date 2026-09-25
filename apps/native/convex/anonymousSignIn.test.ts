// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { exportPKCS8, generateKeyPair } from "jose";
import { afterEach, describe, expect, it, vi } from "vitest";

import { api } from "./_generated/api";
import { newConvexTest } from "./test.setup";

afterEach(() => {
  vi.unstubAllEnvs();
});

// The disabled branch lives in anonymousSignInDisabled.test.ts.
describe("anonymous sign-in with AUTH_ENABLE_ANONYMOUS=true", () => {
  it("issues tokens and creates one anonymous account", async () => {
    const { privateKey } = await generateKeyPair("RS256", {
      extractable: true,
    });
    vi.stubEnv("AUTH_ENABLE_ANONYMOUS", "true");
    vi.stubEnv("JWT_PRIVATE_KEY", await exportPKCS8(privateKey));
    vi.stubEnv("CONVEX_SITE_URL", "https://example.convex.site");
    const backend = newConvexTest();

    const result = await backend.action(api.auth.signIn, {
      provider: "anonymous",
    });

    expect(result).toMatchObject({
      tokens: { token: expect.any(String), refreshToken: expect.any(String) },
    });
    const accounts = await backend.run((ctx) =>
      ctx.db.query("authAccounts").collect(),
    );
    expect(accounts).toHaveLength(1);
    expect(accounts[0]?.provider).toBe("anonymous");
  });
});
