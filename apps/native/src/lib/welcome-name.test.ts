// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useWelcomeName } from "./welcome-name";
import { welcomeName } from "./welcome-save";

const mock = vi.hoisted(() => ({
  store: new Map<string, string>(),
  firstName: null as string | null | undefined,
  settle: [] as (() => void)[],
}));
vi.mock("expo-secure-store", () => ({
  getItem: (key: string) => mock.store.get(key) ?? null,
  setItem: (key: string, value: string) => {
    mock.store.set(key, value);
  },
}));
vi.mock("@/lib/analytics", () => ({ analytics: { captureError: vi.fn() } }));
vi.mock("@/lib/shared-lists", () => ({
  useMyFirstName: () => ({ firstName: mock.firstName }),
}));
vi.mock("@/lib/entitlement", () => ({
  whenSheetSettled: () =>
    new Promise<void>((resolve) => {
      mock.settle.push(resolve);
    }),
}));
vi.mock("@/lib/trial-reminder", () => ({
  whenTrialPrimerDone: () => Promise.resolve(),
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
  mock.store.clear();
  mock.firstName = null;
  mock.settle.length = 0;
});

describe("useWelcomeName", () => {
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

  it("stays shut for an account the flag was never set for", async () => {
    const { result } = renderHook(() => useWelcomeName("u4", true));
    await settleSheets();
    expect(result.current.open).toBe(false);
  });
});
