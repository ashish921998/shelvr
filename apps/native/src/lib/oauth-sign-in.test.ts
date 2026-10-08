// @vitest-environment jsdom
// The OAuth hook's outcomes and the telemetry that separates a person backing
// out from an auth session that never presented.
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { shouldAutoRetry, useOAuthSignIn } from "./oauth-sign-in";

const mock = vi.hoisted(() => ({
  signIn: vi.fn(),
  openAuthSessionAsync: vi.fn(),
  capture: vi.fn(),
  captureError: vi.fn(),
  appleAvailable: vi.fn(),
  appleSignIn: vi.fn(),
  platform: { OS: "android", Version: 35 },
  uuid: 0,
  now: 0,
}));
vi.mock("react-native", () => ({ Platform: mock.platform }));
vi.mock("expo-apple-authentication", () => ({
  isAvailableAsync: mock.appleAvailable,
  signInAsync: mock.appleSignIn,
  AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 },
}));
vi.mock("expo-constants", () => ({
  default: { expoConfig: { extra: { variant: "development" } } },
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
  digestStringAsync: async (_algorithm: string, value: string) =>
    `sha256(${value})`,
  CryptoDigestAlgorithm: { SHA256: "SHA-256" },
}));
vi.mock("@/lib/analytics", () => ({
  analytics: { capture: mock.capture, captureError: mock.captureError },
}));

const redirect = new URL("https://auth.example/start");

beforeEach(() => {
  vi.resetAllMocks();
  mock.uuid = 0;
  mock.now = 1_000_000;
  mock.platform.OS = "android";
  vi.spyOn(Date, "now").mockImplementation(() => mock.now);
});

/** The next web session ends with `result` after `ms` on screen. The default
 * is a person's pace; the automatic retry only follows a much faster end. */
function endSession(result: object, ms = 5_000) {
  mock.openAuthSessionAsync.mockImplementationOnce(async () => {
    mock.now += ms;
    return result;
  });
}

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
    endSession({ type: "cancel" });

    const { hook, outcome } = await run("apple");

    expect(outcome).toBe("cancelled");
    expect(hook.result.current.interrupted).toBe(true);
    expect(captured("auth_cancelled")).toEqual({
      provider: "apple",
      method: "web",
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
    endSession({
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
    endSession({
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
    endSession({ type: "cancel", error });

    await run("google");

    expect(captured("auth_cancelled")).not.toHaveProperty(
      "native_error_domain",
    );
    expect(captured("auth_cancelled")).not.toHaveProperty("native_error_code");
  });

  it("never sends the description itself", async () => {
    mock.signIn.mockResolvedValueOnce({ signingIn: false, redirect });
    endSession({
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
    endSession({ type: "cancel" });

    await run("google");

    expect(captured("auth_cancelled")).not.toHaveProperty(
      "native_error_domain",
    );
    expect(captured("auth_cancelled")).not.toHaveProperty("native_error_code");
  });

  it("keeps a dismiss distinct from a cancel", async () => {
    mock.signIn.mockResolvedValueOnce({ signingIn: false, redirect });
    endSession({ type: "dismiss" });

    const { outcome } = await run("google");

    expect(outcome).toBe("cancelled");
    expect(captured("auth_cancelled")).toMatchObject({ result: "dismiss" });
  });

  it("records a finished sign-in once", async () => {
    mock.signIn
      .mockResolvedValueOnce({ signingIn: false, redirect })
      .mockResolvedValueOnce({ signingIn: true });
    endSession({
      type: "success",
      url: "shelvr://auth/callback?code=abc",
    });

    const { hook, outcome } = await run("google");

    expect(outcome).toBe("completed");
    expect(mock.signIn).toHaveBeenLastCalledWith("google", { code: "abc" });
    expect(hook.result.current.interrupted).toBe(false);
    expect(captured("auth_succeeded")).toEqual({
      provider: "google",
      method: "web",
      surface: "sign_in_view",
      elapsed_ms: expect.any(Number),
      auth_attempt_id: "attempt-1",
    });
  });

  it("fails a code exchange that does not sign in", async () => {
    mock.signIn
      .mockResolvedValueOnce({ signingIn: false, redirect })
      .mockResolvedValueOnce({ signingIn: false });
    endSession({
      type: "success",
      url: "shelvr://auth/callback?code=abc",
    });

    const { hook, outcome } = await run("google");

    expect(outcome).toBe("failed");
    expect(hook.result.current.lastError).not.toBeNull();
    expect(captured("auth_failed")).toEqual({
      provider: "google",
      method: "web",
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

  describe("a web session that never presented", () => {
    it("reopens once on its own and reports the second session", async () => {
      mock.signIn
        .mockResolvedValueOnce({ signingIn: false, redirect })
        .mockResolvedValueOnce({ signingIn: true });
      endSession({ type: "cancel" }, 139);
      endSession({ type: "success", url: "shelvr://auth/callback?code=abc" });

      const { hook, outcome } = await run("google");

      expect(outcome).toBe("completed");
      expect(mock.openAuthSessionAsync).toHaveBeenCalledTimes(2);
      expect(hook.result.current.interrupted).toBe(false);
      expect(captured("auth_cancelled")).toBeUndefined();
      expect(captured("auth_succeeded")).toMatchObject({ auto_retry: true });
    });

    it("gives up after the one reopen", async () => {
      mock.signIn.mockResolvedValueOnce({ signingIn: false, redirect });
      endSession({ type: "cancel" }, 139);
      endSession({ type: "dismiss" }, 90);

      const { hook, outcome } = await run("google");

      expect(outcome).toBe("cancelled");
      expect(mock.openAuthSessionAsync).toHaveBeenCalledTimes(2);
      expect(hook.result.current.interrupted).toBe(true);
      expect(captured("auth_cancelled")).toMatchObject({
        result: "dismiss",
        browser_ms: 90,
        auto_retry: true,
      });
    });

    it("leaves a person's own cancel alone", async () => {
      mock.signIn.mockResolvedValueOnce({ signingIn: false, redirect });
      endSession({ type: "cancel" }, 3_000);

      await run("google");

      expect(mock.openAuthSessionAsync).toHaveBeenCalledTimes(1);
      expect(captured("auth_cancelled")).not.toHaveProperty("auto_retry");
    });

    it.each([
      ["a fast cancel", "cancel", 139, false, true],
      ["a fast dismiss", "dismiss", 799, false, true],
      ["a cancel at the threshold", "cancel", 800, false, false],
      ["a slow cancel", "cancel", 4_000, false, false],
      ["a fast cancel after a retry", "cancel", 139, true, false],
      ["a fast success", "success", 10, false, false],
    ] as const)("%s", (_case, result, browserMs, retried, expected) => {
      expect(shouldAutoRetry(result, browserMs, retried)).toBe(expected);
    });
  });

  describe("Apple on iOS", () => {
    const credential = {
      identityToken: "apple.identity.token",
      fullName: { givenName: "Ada", familyName: "Lovelace" },
    };

    beforeEach(() => {
      mock.platform.OS = "ios";
      mock.appleAvailable.mockResolvedValue(true);
    });

    it("signs in through the system sheet, with no browser session", async () => {
      mock.appleSignIn.mockResolvedValueOnce(credential);
      mock.signIn.mockResolvedValueOnce({ signingIn: true });

      const { outcome } = await run("apple");

      expect(outcome).toBe("completed");
      expect(mock.openAuthSessionAsync).not.toHaveBeenCalled();
      // Apple is given the hash of the value the backend receives.
      const { nonce } = mock.signIn.mock.calls[0][1];
      expect(mock.appleSignIn).toHaveBeenCalledWith({
        requestedScopes: [0, 1],
        nonce: `sha256(${nonce})`,
      });
      expect(mock.signIn).toHaveBeenCalledWith("apple-native", {
        identityToken: "apple.identity.token",
        nonce,
        name: "Ada Lovelace",
      });
      expect(captured("auth_started")).toMatchObject({ method: "native" });
      expect(captured("auth_succeeded")).toMatchObject({
        provider: "apple",
        method: "native",
      });
    });

    it("sends no name when Apple shares none", async () => {
      mock.appleSignIn.mockResolvedValueOnce({
        ...credential,
        fullName: { givenName: null, familyName: null },
      });
      mock.signIn.mockResolvedValueOnce({ signingIn: true });

      await run("apple");

      expect(mock.signIn.mock.calls[0][1]).not.toHaveProperty("name");
    });

    it("reports a person closing the sheet as a cancel, without the retry hint", async () => {
      mock.appleSignIn.mockRejectedValueOnce(
        Object.assign(new Error("canceled"), { code: "ERR_REQUEST_CANCELED" }),
      );

      const { hook, outcome } = await run("apple");

      expect(outcome).toBe("cancelled");
      expect(hook.result.current.interrupted).toBe(false);
      expect(mock.signIn).not.toHaveBeenCalled();
      expect(captured("auth_cancelled")).toMatchObject({
        method: "native",
        result: "cancel",
      });
    });

    it("fails on any other sheet error", async () => {
      mock.appleSignIn.mockRejectedValueOnce(
        Object.assign(new Error("unknown"), { code: "ERR_REQUEST_UNKNOWN" }),
      );

      const { outcome } = await run("apple");

      expect(outcome).toBe("failed");
      expect(captured("auth_failed")).toMatchObject({
        method: "native",
        stage: "browser",
      });
    });

    it("fails when the backend rejects the identity token", async () => {
      mock.appleSignIn.mockResolvedValueOnce(credential);
      mock.signIn.mockResolvedValueOnce({ signingIn: false });

      const { outcome } = await run("apple");

      expect(outcome).toBe("failed");
      expect(captured("auth_failed")).toMatchObject({ stage: "exchange" });
    });

    it("keeps the web session where the sheet is unavailable", async () => {
      mock.appleAvailable.mockResolvedValue(false);
      mock.signIn.mockResolvedValueOnce({ signingIn: false, redirect });
      endSession({ type: "cancel" });

      await run("apple");

      expect(mock.appleSignIn).not.toHaveBeenCalled();
      expect(mock.openAuthSessionAsync).toHaveBeenCalledTimes(1);
      expect(captured("auth_started")).toMatchObject({ method: "web" });
    });

    it("keeps Google on the web session", async () => {
      mock.signIn.mockResolvedValueOnce({ signingIn: false, redirect });
      endSession({ type: "cancel" });

      await run("google");

      expect(mock.appleSignIn).not.toHaveBeenCalled();
      expect(captured("auth_started")).toMatchObject({ method: "web" });
    });
  });
});
