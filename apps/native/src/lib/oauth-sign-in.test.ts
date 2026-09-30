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
  uuid: 0,
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
vi.mock("expo-crypto", () => ({
  randomUUID: () => `attempt-${++mock.uuid}`,
}));
vi.mock("@/lib/analytics", () => ({
  analytics: { capture: mock.capture, captureError: mock.captureError },
}));

const redirect = new URL("https://auth.example/start");

beforeEach(() => {
  vi.clearAllMocks();
  mock.uuid = 0;
});

async function run(
  provider: "apple" | "google" | "anonymous",
  surface: "sign_in_view" | "demo_sheet" = "sign_in_view",
) {
  const hook = renderHook(() => useOAuthSignIn(surface));
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
      surface: "sign_in_view",
      result: "cancel",
      elapsed_ms: expect.any(Number),
      browser_ms: expect.any(Number),
      auth_attempt_id: "attempt-1",
    });
    expect(captured("auth_succeeded")).toBeUndefined();
  });

  it("carries the OS error domain and code off a cancel", async () => {
    mock.signIn.mockResolvedValueOnce({ signingIn: false, redirect });
    mock.openAuthSessionAsync.mockResolvedValueOnce({
      type: "cancel",
      error:
        "The operation couldn’t be completed. " +
        "(com.apple.AuthenticationServices.WebAuthenticationSession error 3.)",
    });

    await run("google", "demo_sheet");

    expect(captured("auth_cancelled")).toMatchObject({
      surface: "demo_sheet",
      result: "cancel",
      native_error_domain:
        "com.apple.AuthenticationServices.WebAuthenticationSession",
      native_error_code: 3,
    });
  });

  // Foundation writes the label between the domain and the code in the
  // device's language, so a parser keyed on the English word would go blind on
  // exactly the devices that are hardest to get a second look at. One of the
  // production devices this telemetry exists for runs a zh-Hans locale.
  it.each([
    [
      "German",
      "(com.apple.AuthenticationServices.WebAuthenticationSession-Fehler 3.)",
    ],
    [
      "French",
      "(com.apple.AuthenticationServices.WebAuthenticationSession erreur 3.)",
    ],
    [
      "Japanese",
      "（com.apple.AuthenticationServices.WebAuthenticationSession エラー 3。）",
    ],
  ])("reads the domain and code from a %s description", async (_lang, tail) => {
    mock.signIn.mockResolvedValueOnce({ signingIn: false, redirect });
    mock.openAuthSessionAsync.mockResolvedValueOnce({
      type: "cancel",
      error: `Die Operation konnte nicht abgeschlossen werden. ${tail}`,
    });

    await run("google");

    expect(captured("auth_cancelled")).toMatchObject({
      native_error_domain:
        "com.apple.AuthenticationServices.WebAuthenticationSession",
      native_error_code: 3,
    });
  });

  it.each([
    ["no parenthesised error", "Something went wrong."],
    ["no numeric code", "Failed. (com.apple.SomeDomain error unknown.)"],
    ["an empty string", ""],
  ])("drops %s rather than guessing", async (_case, error) => {
    mock.signIn.mockResolvedValueOnce({ signingIn: false, redirect });
    mock.openAuthSessionAsync.mockResolvedValueOnce({ type: "cancel", error });

    await run("google");

    expect(captured("auth_cancelled")).not.toHaveProperty(
      "native_error_domain",
    );
    expect(captured("auth_cancelled")).not.toHaveProperty("native_error_code");
  });

  it("never sends the description itself", async () => {
    mock.signIn.mockResolvedValueOnce({ signingIn: false, redirect });
    mock.openAuthSessionAsync.mockResolvedValueOnce({
      type: "cancel",
      error:
        "The operation couldn’t be completed. " +
        "(com.apple.AuthenticationServices.WebAuthenticationSession error 3.)",
    });

    await run("google");

    expect(JSON.stringify(captured("auth_cancelled"))).not.toContain(
      "couldn’t be completed",
    );
  });

  it("sends no error fields when the session reports no error", async () => {
    mock.signIn.mockResolvedValueOnce({ signingIn: false, redirect });
    mock.openAuthSessionAsync.mockResolvedValueOnce({ type: "cancel" });

    await run("google");

    expect(captured("auth_cancelled")).not.toHaveProperty(
      "native_error_domain",
    );
    expect(captured("auth_cancelled")).not.toHaveProperty("native_error_code");
  });

  it("keeps a dismiss distinct from a cancel", async () => {
    mock.signIn.mockResolvedValueOnce({ signingIn: false, redirect });
    mock.openAuthSessionAsync.mockResolvedValueOnce({ type: "dismiss" });

    const { outcome } = await run("google");

    expect(outcome).toBe("cancelled");
    expect(captured("auth_cancelled")).toMatchObject({ result: "dismiss" });
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
      surface: "sign_in_view",
      elapsed_ms: expect.any(Number),
      auth_attempt_id: "attempt-1",
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
      surface: "sign_in_view",
      stage: "exchange",
      elapsed_ms: expect.any(Number),
      auth_attempt_id: "attempt-1",
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
      { provider: "apple", stage: "request", surface: "sign_in_view" },
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

  it("shares one attempt id across an attempt's events and mints a fresh one per call", async () => {
    mock.signIn.mockResolvedValue({ signingIn: true });

    await run("anonymous");
    await run("apple");

    const started = mock.capture.mock.calls
      .filter(([name]) => name === "auth_started")
      .map(([, properties]) => properties);
    expect(started).toHaveLength(2);
    // A funnel pairs each start with the outcome that ended it through the
    // shared id, and tells repeat starts by one person apart by the new one.
    expect(started[0].auth_attempt_id).toBe("attempt-1");
    expect(started[1].auth_attempt_id).toBe("attempt-2");
    expect(captured("auth_succeeded")).toMatchObject({
      auth_attempt_id: "attempt-1",
    });
  });
});
