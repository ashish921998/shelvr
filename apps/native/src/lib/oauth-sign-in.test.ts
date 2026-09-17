// @vitest-environment jsdom
// The OAuth hook's outcomes and the telemetry that separates a person backing
// out from an auth session that never presented.
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useOAuthSignIn } from "./oauth-sign-in";

const mock = vi.hoisted(() => ({
  signIn: vi.fn(),
  openAuthSessionAsync: vi.fn(),
  capture: vi.fn(),
  captureError: vi.fn(),
}));
vi.mock("@convex-dev/auth/react", () => ({
  useAuthActions: () => ({ signIn: mock.signIn }),
}));
vi.mock("expo-auth-session", () => ({
  makeRedirectUri: () => "shelvr://auth/callback",
}));
vi.mock("expo-web-browser", () => ({
  openAuthSessionAsync: mock.openAuthSessionAsync,
}));
vi.mock("@/lib/analytics", () => ({
  analytics: { capture: mock.capture, captureError: mock.captureError },
}));

const redirect = new URL("https://auth.example/start");

beforeEach(() => {
  vi.clearAllMocks();
});

async function run(provider: "apple" | "google" | "anonymous") {
  const hook = renderHook(() => useOAuthSignIn());
  let outcome: string | undefined;
  await act(async () => {
    outcome = await hook.result.current.signInWith(provider);
  });
  return { hook, outcome };
}

function captured(event: string) {
  return mock.capture.mock.calls.find(([name]) => name === event)?.[1];
}

describe("useOAuthSignIn", () => {
  it("keeps a cancel visible and times it", async () => {
    mock.signIn.mockResolvedValueOnce({ signingIn: false, redirect });
    mock.openAuthSessionAsync.mockResolvedValueOnce({ type: "cancel" });

    const { hook, outcome } = await run("apple");

    expect(outcome).toBe("cancelled");
    expect(hook.result.current.interrupted).toBe(true);
    expect(captured("auth_cancelled")).toEqual({
      provider: "apple",
      elapsed_ms: expect.any(Number),
      browser_ms: expect.any(Number),
    });
    expect(captured("auth_succeeded")).toBeUndefined();
  });

  it("records a finished sign-in once", async () => {
    mock.signIn
      .mockResolvedValueOnce({ signingIn: false, redirect })
      .mockResolvedValueOnce({ signingIn: true });
    mock.openAuthSessionAsync.mockResolvedValueOnce({
      type: "success",
      url: "shelvr://auth/callback?code=abc",
    });

    const { hook, outcome } = await run("google");

    expect(outcome).toBe("completed");
    expect(mock.signIn).toHaveBeenLastCalledWith("google", { code: "abc" });
    expect(hook.result.current.interrupted).toBe(false);
    expect(captured("auth_succeeded")).toEqual({
      provider: "google",
      elapsed_ms: expect.any(Number),
    });
  });

  it("fails a code exchange that does not sign in", async () => {
    mock.signIn
      .mockResolvedValueOnce({ signingIn: false, redirect })
      .mockResolvedValueOnce({ signingIn: false });
    mock.openAuthSessionAsync.mockResolvedValueOnce({
      type: "success",
      url: "shelvr://auth/callback?code=abc",
    });

    const { hook, outcome } = await run("google");

    expect(outcome).toBe("failed");
    expect(hook.result.current.lastError).not.toBeNull();
    expect(captured("auth_failed")).toEqual({
      provider: "google",
      stage: "exchange",
      elapsed_ms: expect.any(Number),
    });
    expect(captured("auth_succeeded")).toBeUndefined();
  });

  it("reports which stage failed", async () => {
    mock.signIn.mockRejectedValueOnce(new Error("offline"));

    const { outcome } = await run("apple");

    expect(outcome).toBe("failed");
    expect(captured("auth_failed")).toMatchObject({ stage: "request" });
    expect(mock.captureError).toHaveBeenCalledWith(
      "auth_failed",
      expect.any(Error),
      { provider: "apple", stage: "request" },
    );
  });

  it("completes a provider that needs no browser", async () => {
    mock.signIn.mockResolvedValueOnce({ signingIn: true });

    const { outcome } = await run("anonymous");

    expect(outcome).toBe("completed");
    expect(mock.openAuthSessionAsync).not.toHaveBeenCalled();
    expect(captured("auth_succeeded")).toMatchObject({
      provider: "anonymous",
    });
  });
});
