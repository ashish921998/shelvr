// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { useAiConsent } from "./ai-consent";

const mocks = vi.hoisted(() => ({
  authenticated: true,
  data: undefined as { status: string; version: number } | undefined,
  queryArgs: undefined as unknown,
  setConsent: vi.fn(),
  capture: vi.fn(),
}));
vi.mock("convex/react", () => ({
  useConvexAuth: () => ({ isAuthenticated: mocks.authenticated }),
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
