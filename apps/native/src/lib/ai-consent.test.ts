// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { useAiConsent } from "./ai-consent";

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
vi.mock("@/lib/analytics", () => ({ analytics: { capture: mocks.capture } }));

beforeEach(() => {
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
  expect(mocks.queryArgs).toBe("skip");
});

it.each([undefined, "unset", "granted", "declined"])(
  "reads permission %s without automatically recording an answer",
  (status) => {
    mocks.data = status ? { status, version: 1 } : undefined;
    const { result } = renderHook(() => useAiConsent());
    expect(result.current.status).toBe(status ?? "loading");
    expect(mocks.setConsent).not.toHaveBeenCalled();
  },
);

it("records an answer, and reports it only once the server has it", async () => {
  mocks.setConsent.mockResolvedValue(null);
  const { result } = renderHook(() => useAiConsent());
  await result.current.answer(false, "settings");
  expect(mocks.setConsent).toHaveBeenCalledWith({ granted: false });
  expect(mocks.capture).toHaveBeenCalledWith("ai_consent_answered", {
    granted: false,
    surface: "settings",
  });

  mocks.capture.mockReset();
  mocks.setConsent.mockRejectedValue(new Error("offline"));
  await expect(result.current.answer(true, "settings")).rejects.toThrow();
  expect(mocks.capture).not.toHaveBeenCalled();
});
