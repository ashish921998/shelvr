// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { markAiDisclosedAtSignIn, useAiConsent } from "./ai-consent";

const mocks = vi.hoisted(() => ({
  authenticated: true,
  authLoading: false,
  data: undefined as { status: string; version: number } | undefined,
  queryArgs: undefined as unknown,
  setConsent: vi.fn(),
  capture: vi.fn(),
}));
vi.mock("convex/react", () => ({
  useConvexAuth: () => ({
    isAuthenticated: mocks.authenticated,
    isLoading: mocks.authLoading,
  }),
  useMutation: () => mocks.setConsent,
}));
vi.mock("@convex/_generated/api", () => ({
  api: { aiConsent: { getStatus: "getStatus", setConsent: "setConsent" } },
}));
vi.mock("@convex-dev/react-query", () => ({
  convexQuery: (_ref: unknown, args: unknown) => ({ args }),
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: (options: { args: unknown }) => {
    mocks.queryArgs = options.args;
    return { data: mocks.data };
  },
}));
const kv = vi.hoisted(() => new Map<string, boolean>());
vi.mock("react-native-mmkv", () => ({
  createMMKV: () => ({
    getBoolean: (key: string) => kv.get(key),
    set: (key: string, value: boolean) => void kv.set(key, value),
    remove: (key: string) => kv.delete(key),
  }),
}));
vi.mock("@/lib/analytics", () => ({ analytics: { capture: mocks.capture } }));

beforeEach(() => {
  kv.clear();
  mocks.authenticated = true;
  mocks.authLoading = false;
  mocks.data = undefined;
  mocks.setConsent.mockReset();
  mocks.capture.mockReset();
});

it("leaves a signed-out user alone and asks the server nothing", () => {
  mocks.authenticated = false;
  const { result } = renderHook(() => useAiConsent());
  expect(result.current.status).toBe("signed-out");
  expect(result.current.savesBlocked).toBe(false);
  expect(mocks.queryArgs).toBe("skip");
});

it("asks with the card when someone already signed in has not answered", () => {
  mocks.data = { status: "unset", version: 1 };
  const { result } = renderHook(() => useAiConsent());
  expect(result.current.asking).toBe(true);
  expect(mocks.setConsent).not.toHaveBeenCalled();
});

it("records a yes, with no card, for someone who just signed in past the disclosure", async () => {
  mocks.setConsent.mockResolvedValue(null);
  markAiDisclosedAtSignIn();
  mocks.data = { status: "unset", version: 1 };
  const { result, rerender } = renderHook(() => useAiConsent());
  expect(result.current.asking).toBe(false);
  expect(result.current.savesBlocked).toBe(true);
  await vi.waitFor(() =>
    expect(mocks.capture).toHaveBeenCalledWith("ai_consent_answered", {
      granted: true,
      surface: "sign_in",
    }),
  );
  expect(mocks.setConsent).toHaveBeenCalledExactlyOnceWith({ granted: true });

  // A later sign-out and an already signed-in session start from scratch.
  mocks.data = { status: "granted", version: 1 };
  rerender();
  mocks.data = { status: "unset", version: 1 };
  rerender();
  expect(result.current.asking).toBe(true);
});

it("writes the sign-in yes once when two screens watch for it", async () => {
  let recorded: (value: null) => void = () => {};
  mocks.setConsent.mockReturnValue(
    new Promise<null>((resolve) => {
      recorded = resolve;
    }),
  );
  markAiDisclosedAtSignIn();
  mocks.data = { status: "unset", version: 1 };
  renderHook(() => useAiConsent());
  renderHook(() => useAiConsent());
  expect(mocks.setConsent).toHaveBeenCalledTimes(1);

  recorded(null);
  await vi.waitFor(() => expect(mocks.capture).toHaveBeenCalledTimes(1));
});

it("never overrides a no: signing in again keeps AI off", () => {
  markAiDisclosedAtSignIn();
  mocks.data = { status: "declined", version: 1 };
  renderHook(() => useAiConsent());
  expect(mocks.setConsent).not.toHaveBeenCalled();
});

it("falls back to the card when the yes could not be recorded", async () => {
  mocks.setConsent.mockRejectedValue(new Error("offline"));
  markAiDisclosedAtSignIn();
  mocks.data = { status: "unset", version: 1 };
  const { result } = renderHook(() => useAiConsent());
  await vi.waitFor(() => expect(result.current.asking).toBe(true));
});

it.each([
  [undefined, "loading", true],
  ["unset", "unset", true],
  ["granted", "granted", false],
  ["declined", "declined", false],
] as const)(
  "a signed-in user with answer %s reads as %s (blocked: %s)",
  (answer, status, blocked) => {
    mocks.data = answer ? { status: answer, version: 1 } : undefined;
    const { result } = renderHook(() => useAiConsent());
    expect(result.current.status).toBe(status);
    expect(result.current.savesBlocked).toBe(blocked);
  },
);

it("does not hold a launch back once this install has an answer on record", () => {
  mocks.data = { status: "declined", version: 1 };
  const { rerender, result } = renderHook(() => useAiConsent());
  mocks.data = undefined;
  rerender();
  expect(result.current.status).toBe("loading");
  expect(result.current.savesBlocked).toBe(false);
});

it("forgets the recorded answer when the server asks again", () => {
  mocks.data = { status: "granted", version: 1 };
  const { rerender, result } = renderHook(() => useAiConsent());
  mocks.data = { status: "unset", version: 2 };
  rerender();
  mocks.data = undefined;
  rerender();
  expect(result.current.savesBlocked).toBe(true);
});

it("records an answer, and reports it only once the server has it", async () => {
  mocks.setConsent.mockResolvedValue(null);
  const { result } = renderHook(() => useAiConsent());
  await result.current.answer(false, "card");
  expect(mocks.setConsent).toHaveBeenCalledWith({ granted: false });
  expect(mocks.capture).toHaveBeenCalledWith("ai_consent_answered", {
    granted: false,
    surface: "card",
  });

  mocks.capture.mockReset();
  mocks.setConsent.mockRejectedValue(new Error("offline"));
  await expect(result.current.answer(true, "card")).rejects.toThrow();
  expect(mocks.capture).not.toHaveBeenCalled();
});

it("keeps the recorded answer while a cold launch is still restoring auth", () => {
  mocks.data = { status: "granted", version: 1 };
  const { rerender, result } = renderHook(() => useAiConsent());
  mocks.authenticated = false;
  mocks.authLoading = true;
  mocks.data = undefined;
  rerender();
  mocks.authenticated = true;
  mocks.authLoading = false;
  rerender();
  expect(result.current.status).toBe("loading");
  expect(result.current.savesBlocked).toBe(false);
});
