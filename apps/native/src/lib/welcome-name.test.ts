// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { analytics } from "@/lib/analytics";
import { useWelcomeName } from "./welcome-name";
import { welcomeName } from "./welcome-save";

const mock = vi.hoisted(() => ({
  store: new Map<string, string>(),
  firstName: null as string | null | undefined,
  failed: false,
  settle: [] as (() => void)[],
  focused: true,
  lookupError: new Error("offline"),
}));
vi.mock("expo-router", () => ({ useIsFocused: () => mock.focused }));
vi.mock("expo-secure-store", () => ({
  getItem: (key: string) => mock.store.get(key) ?? null,
  setItem: (key: string, value: string) => {
    mock.store.set(key, value);
  },
}));
vi.mock("@/lib/analytics", () => ({ analytics: { captureError: vi.fn() } }));
vi.mock("@/lib/shared-lists", () => ({
  useMyFirstName: () => ({
    firstName: mock.firstName,
    failed: mock.failed,
    error: mock.failed ? mock.lookupError : null,
  }),
}));
vi.mock("@/lib/entitlement", () => ({
  whenSheetSettled: () =>
    new Promise<void>((resolve) => {
      mock.settle.push(resolve);
    }),
}));
vi.mock("@/lib/welcome-save", async () => {
  const { oncePerAccount } = await import("./once-per-account");
  return { welcomeName: oncePerAccount("welcomeName") };
});

async function settleSheets() {
  await act(async () => {
    for (const resolve of mock.settle.splice(0)) resolve();
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mock.store.clear();
  mock.firstName = null;
  for (const resolve of mock.settle.splice(0)) resolve();
  mock.focused = true;
  mock.failed = false;
});

describe("useWelcomeName", () => {
  it("keeps the ask when Home stops being ready while it waits, and asks once it is ready again", async () => {
    welcomeName.mark("u1");
    let ready = true;
    const { result, rerender } = renderHook(() => useWelcomeName("u1", ready));
    ready = false;
    rerender();
    await settleSheets();
    expect(result.current.open).toBe(false);
    expect(welcomeName.isPending("u1")).toBe(true);
    ready = true;
    rerender();
    await settleSheets();
    expect(result.current.open).toBe(true);
    expect(welcomeName.isPending("u1")).toBe(false);
  });

  it("keeps the ask while another screen is in front of Home", async () => {
    welcomeName.mark("u1");
    const { result, rerender } = renderHook(() => useWelcomeName("u1", true));
    mock.focused = false;
    rerender();
    await settleSheets();
    expect(result.current.open).toBe(false);
    expect(welcomeName.isPending("u1")).toBe(true);
    mock.focused = true;
    rerender();
    await settleSheets();
    expect(result.current.open).toBe(true);
  });

  it("opens once for a new account with no name, after other sheets have settled", async () => {
    welcomeName.mark("u1");
    const { result, rerender } = renderHook(() => useWelcomeName("u1", true));
    expect(result.current.open).toBe(false);
    expect(welcomeName.isPending("u1")).toBe(true);
    await settleSheets();
    expect(result.current.open).toBe(true);
    expect(welcomeName.isPending("u1")).toBe(false);

    act(() => result.current.close());
    rerender();
    expect(result.current.open).toBe(false);
    const again = renderHook(() => useWelcomeName("u1", true));
    await settleSheets();
    expect(again.result.current.open).toBe(false);
  });

  it("never opens for an account that already has a name, and spends its turn", () => {
    mock.firstName = "Ashish";
    welcomeName.mark("u2");
    const { result } = renderHook(() => useWelcomeName("u2", true));
    expect(result.current.open).toBe(false);
    expect(welcomeName.isPending("u2")).toBe(false);
    expect(mock.settle).toHaveLength(0);
  });

  it("waits for the name to load and for Home to be ready", async () => {
    mock.firstName = undefined;
    welcomeName.mark("u3");
    let ready = false;
    const { result, rerender } = renderHook(() => useWelcomeName("u3", ready));
    mock.firstName = null;
    rerender();
    expect(welcomeName.isPending("u3")).toBe(true);
    ready = true;
    rerender();
    await settleSheets();
    expect(result.current.open).toBe(true);
  });

  it("spends its turn without asking when the name cannot be read, and reports why", async () => {
    mock.firstName = undefined;
    mock.failed = true;
    welcomeName.mark("u5");
    const { result } = renderHook(() => useWelcomeName("u5", true));
    expect(result.current.open).toBe(false);
    expect(welcomeName.isPending("u5")).toBe(false);
    expect(mock.settle).toHaveLength(0);
    expect(analytics.captureError).toHaveBeenCalledTimes(1);
    expect(analytics.captureError).toHaveBeenCalledWith(
      "welcome_name_lookup_failed",
      mock.lookupError,
    );
  });

  it("stays shut for an account the flag was never set for", async () => {
    const { result } = renderHook(() => useWelcomeName("u4", true));
    await settleSheets();
    expect(result.current.open).toBe(false);
  });
});
