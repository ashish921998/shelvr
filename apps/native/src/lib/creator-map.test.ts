// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { creatorMapListName, useSaveAllSwitch } from "./creator-map";

type Page = {
  token: string;
  cities: string[];
  blocked: boolean;
  saveAll: boolean;
} | null;

const mocks = vi.hoisted(() => ({
  page: undefined as unknown,
  setSaveAll: vi.fn(),
  guard: vi.fn(),
  guardLoading: false,
  alert: vi.fn(),
  capture: vi.fn(),
  captureError: vi.fn(),
}));

const TEMPLATES: Record<string, string> = {
  "creatorMaps.listName": "%{name}’s %{city}",
  "creatorMaps.listNameNoName": "%{city} map",
};

vi.mock("@/lib/i18n", () => ({
  t: (key: string, values: Record<string, string> = {}) =>
    (TEMPLATES[key] ?? key).replace(
      /%\{(\w+)\}/g,
      (_, name: string) => values[name] ?? "",
    ),
}));
vi.mock("react-native", () => ({ Alert: { alert: mocks.alert } }));
vi.mock("@convex/_generated/api", () => ({
  api: {
    publicMaps: {
      getMyPublicMap: { name: "page" },
      setPublicMapSaveAll: { name: "saveAll" },
    },
  },
}));
vi.mock("@convex-dev/react-query", () => ({
  convexQuery: (ref: { name: string }) => ({ name: ref.name }),
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: mocks.page, isError: false }),
}));
vi.mock("convex/react", () => ({ useMutation: () => mocks.setSaveAll }));
vi.mock("@/lib/entitlement", () => ({
  usePaywallGuard: (placement: string) => {
    if (placement !== "creator_map") throw new Error(placement);
    return { guard: mocks.guard, loading: mocks.guardLoading };
  },
}));
vi.mock("@/lib/analytics", () => ({
  analytics: { capture: mocks.capture, captureError: mocks.captureError },
}));

const TOKEN = "0123456789abcdef0123456789abcdef";

function page(over: Partial<NonNullable<Page>> = {}): Page {
  return {
    token: TOKEN,
    cities: ["Mexico City"],
    blocked: false,
    saveAll: false,
    ...over,
  };
}

function deferred() {
  let resolve: (value: boolean) => void = () => {};
  const promise = new Promise<boolean>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

const order = (mock: { mock: { invocationCallOrder: number[] } }) =>
  mock.mock.invocationCallOrder[0]!;

describe("creatorMapListName", () => {
  it("names the list after the creator and the city", () => {
    expect(creatorMapListName("Maya", "Mexico City")).toBe(
      "Maya’s Mexico City",
    );
  });

  it("names it after the city alone without a first name", () => {
    expect(creatorMapListName(undefined, "Mexico City")).toBe(
      "Mexico City map",
    );
    expect(creatorMapListName("", "Mexico City")).toBe("Mexico City map");
  });

  it("drops the name when the named form is longer than a list name", () => {
    const city = "c".repeat(50);
    const name = creatorMapListName("n".repeat(40), city);
    expect(name).toBe(`${city} map`);
    expect(name).toHaveLength(54);
  });

  it("cuts the city when even the plain form is too long", () => {
    const city = "c".repeat(75);
    expect(creatorMapListName("n".repeat(40), city)).toBe(city.slice(0, 60));
  });
});

describe("useSaveAllSwitch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.page = page();
    mocks.guardLoading = false;
    mocks.guard.mockResolvedValue(true);
    mocks.setSaveAll.mockImplementation(async ({ on }: { on: boolean }) => on);
  });

  it("asks the guard, then turns Save all on, then counts it", async () => {
    const { result } = renderHook(() => useSaveAllSwitch());
    expect(result.current).toMatchObject({ ready: true, on: false });
    await act(async () => result.current.toggle(true));
    expect(mocks.setSaveAll).toHaveBeenCalledWith({ on: true });
    expect(order(mocks.guard)).toBeLessThan(order(mocks.setSaveAll));
    expect(order(mocks.setSaveAll)).toBeLessThan(order(mocks.capture));
    expect(mocks.capture).toHaveBeenCalledWith(
      "creator_map_save_all_switched",
      { on: true },
    );
  });

  it("does nothing when the guard opens the paywall instead", async () => {
    mocks.guard.mockResolvedValue(false);
    const { result } = renderHook(() => useSaveAllSwitch());
    await act(async () => result.current.toggle(true));
    expect(mocks.setSaveAll).not.toHaveBeenCalled();
    expect(mocks.capture).not.toHaveBeenCalled();
    expect(result.current.on).toBe(false);
  });

  it("turns Save all off without asking the guard", async () => {
    mocks.page = page({ saveAll: true });
    const { result } = renderHook(() => useSaveAllSwitch());
    expect(result.current.on).toBe(true);
    await act(async () => result.current.toggle(false));
    expect(mocks.guard).not.toHaveBeenCalled();
    expect(mocks.setSaveAll).toHaveBeenCalledWith({ on: false });
    expect(mocks.capture).toHaveBeenCalledWith(
      "creator_map_save_all_switched",
      { on: false },
    );
  });

  it("alerts and reports a failure, and goes back to the saved value", async () => {
    const error = new Error("Server Error");
    mocks.setSaveAll.mockRejectedValue(error);
    const { result } = renderHook(() => useSaveAllSwitch());
    await act(async () => result.current.toggle(true));
    expect(mocks.alert).toHaveBeenCalledWith("creatorMaps.switchFailed");
    expect(mocks.captureError).toHaveBeenCalledWith(
      "creator_map_switch_failed",
      error,
    );
    expect(mocks.capture).not.toHaveBeenCalled();
    expect(result.current).toMatchObject({ on: false, busy: false });
  });

  it("shows the value it is moving to while the change is pending", async () => {
    const pending = deferred();
    mocks.setSaveAll.mockReturnValue(pending.promise);
    const { result } = renderHook(() => useSaveAllSwitch());
    await act(async () => result.current.toggle(true));
    expect(result.current).toMatchObject({ on: true, busy: true });
    mocks.page = page({ saveAll: true });
    await act(async () => pending.resolve(true));
    expect(result.current).toMatchObject({ on: true, busy: false });
  });

  it("holds the switch while the plan loads, only when it is off", () => {
    mocks.guardLoading = true;
    const off = renderHook(() => useSaveAllSwitch());
    expect(off.result.current.busy).toBe(true);
    mocks.page = page({ saveAll: true });
    const on = renderHook(() => useSaveAllSwitch());
    expect(on.result.current.busy).toBe(false);
  });

  it.each([
    ["while the page loads", undefined],
    ["without a page", null],
    ["for a blocked page", page({ blocked: true, saveAll: true })],
  ])("is not ready %s", (_name, value) => {
    mocks.page = value;
    const { result } = renderHook(() => useSaveAllSwitch());
    expect(result.current.ready).toBe(false);
  });
});
