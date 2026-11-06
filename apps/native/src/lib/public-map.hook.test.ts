// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useMapPage } from "./public-map";

type AlertButton = { text: string; style?: string; onPress?: () => void };
type Page = { token: string; cities: string[]; blocked: boolean } | null;
type Preview = { city: string; places: { name: string; went: boolean }[] };

const mocks = vi.hoisted(() => ({
  page: undefined as unknown,
  previews: undefined as unknown,
  mutations: {
    set: vi.fn(),
    rotate: vi.fn(),
    off: vi.fn(),
  } as Record<string, ReturnType<typeof vi.fn>>,
  guard: vi.fn(),
  guardLoading: false,
  entitlement: { entitled: true, loading: false },
  alert: vi.fn(),
  capture: vi.fn(),
  captureError: vi.fn(),
  success: vi.fn(),
  shareUrl: vi.fn(),
}));
vi.mock("react-native", () => ({
  Alert: { alert: mocks.alert },
  Platform: { OS: "ios" },
  Share: { sharedAction: "sharedAction" },
}));
vi.mock("@convex/_generated/api", () => ({
  api: {
    publicMaps: {
      getMyPublicMap: { name: "page" },
      listPublicMapCities: { name: "previews" },
      setPublicMapCities: { name: "set" },
      rotatePublicMapLink: { name: "rotate" },
      turnOffPublicMap: { name: "off" },
    },
  },
}));
vi.mock("@convex-dev/react-query", () => ({
  convexQuery: (ref: { name: string }) => ({ name: ref.name }),
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: ({ name }: { name: "page" | "previews" }) => ({
    data: mocks[name],
    isError: false,
  }),
}));
vi.mock("convex/react", () => ({
  useMutation: (ref: { name: string }) => mocks.mutations[ref.name],
}));
vi.mock("@/lib/entitlement", () => ({
  usePaywallGuard: () => ({ guard: mocks.guard, loading: mocks.guardLoading }),
  useEntitlement: () => mocks.entitlement,
}));
vi.mock("@/lib/analytics", () => ({
  analytics: { capture: mocks.capture, captureError: mocks.captureError },
}));
vi.mock("@/lib/haptics", () => ({ haptics: { success: mocks.success } }));
vi.mock("@/lib/i18n", () => ({ t: (key: string) => key }));
vi.mock("@/lib/share-link", () => ({
  shareUrl: mocks.shareUrl,
  shareRefOf: async () => "0123456789abcdef",
}));

const TOKEN = "0123456789abcdef0123456789abcdef";
const PREVIEWS: Preview[] = [
  {
    city: "Mexico City",
    places: [
      { name: "Contramar", went: true },
      { name: "Café Avellaneda", went: false },
    ],
  },
  { city: "Austin", places: [{ name: "Jo's Coffee", went: false }] },
];

function setData(page: Page | undefined, previews: Preview[] | undefined) {
  mocks.page = page;
  mocks.previews = previews;
}

function lastAlert() {
  const call = mocks.alert.mock.calls.at(-1);
  if (!call) throw new Error("no alert shown");
  return {
    title: call[0] as string,
    message: call[1] as string | undefined,
    buttons: (call[2] ?? []) as AlertButton[],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("EXPO_PUBLIC_WEB_URL", "");
  setData(null, PREVIEWS);
  mocks.guardLoading = false;
  mocks.entitlement = { entitled: true, loading: false };
  mocks.guard.mockResolvedValue(true);
  mocks.mutations.set.mockImplementation(
    async ({ cities }: { cities: string[] }) => ({ token: TOKEN, cities }),
  );
  mocks.mutations.rotate.mockResolvedValue("fedcba9876543210fedcba9876543210");
  mocks.mutations.off.mockResolvedValue(null);
  mocks.shareUrl.mockResolvedValue({ action: "sharedAction" });
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("useMapPage creating a page", () => {
  it("asks the guard, saves the picks and does not open the share sheet", async () => {
    const { result } = renderHook(() => useMapPage("map"));
    expect(result.current.status).toBe("off");
    expect(result.current.canSubmit).toBe(false);
    act(() => result.current.toggle("Mexico City"));
    act(() => result.current.toggle("Austin"));
    expect(result.current.canSubmit).toBe(true);

    await act(async () => {
      await result.current.submit();
    });

    expect(mocks.guard).toHaveBeenCalledTimes(1);
    expect(mocks.mutations.set).toHaveBeenCalledWith({
      cities: ["Mexico City", "Austin"],
    });
    expect(mocks.success).toHaveBeenCalled();
    expect(mocks.capture).toHaveBeenCalledWith("public_map_created", {
      cities: 2,
    });
    expect(mocks.shareUrl).not.toHaveBeenCalled();
  });

  it("calls no mutation when the guard refuses", async () => {
    mocks.guard.mockResolvedValue(false);
    const { result } = renderHook(() => useMapPage("map"));
    act(() => result.current.toggle("Austin"));
    await act(async () => {
      await result.current.submit();
    });
    expect(mocks.guard).toHaveBeenCalled();
    expect(mocks.mutations.set).not.toHaveBeenCalled();
    expect(mocks.capture).not.toHaveBeenCalledWith(
      "public_map_created",
      expect.anything(),
    );
    expect(result.current.busy).toBe(false);
  });

  it("keeps Create link disabled while the guard is loading", () => {
    mocks.guardLoading = true;
    const { result } = renderHook(() => useMapPage("map"));
    act(() => result.current.toggle("Austin"));
    expect(result.current.canSubmit).toBe(false);
  });

  it("alerts and keeps the picks when the save fails", async () => {
    const failure = new Error("offline");
    mocks.mutations.set.mockRejectedValue(failure);
    const { result } = renderHook(() => useMapPage("map"));
    act(() => result.current.toggle("Austin"));
    await act(async () => {
      await result.current.submit();
    });
    expect(mocks.alert).toHaveBeenCalledWith("publicMap.failed");
    expect(mocks.captureError).toHaveBeenCalledWith(
      "public_map_save_failed",
      failure,
    );
    expect(result.current.pickedCount).toBe(1);
    expect(result.current.busy).toBe(false);
  });
});

describe("useMapPage with a page", () => {
  beforeEach(() => {
    setData(
      { token: TOKEN, cities: ["Mexico City", "Austin"], blocked: false },
      PREVIEWS,
    );
  });

  it("saves changed cities without asking the guard", async () => {
    const { result } = renderHook(() => useMapPage("map"));
    expect(result.current.status).toBe("on");
    expect(result.current.url).toBe(`https://shelvr-web.vercel.app/m/${TOKEN}`);
    expect(result.current.edited).toBe(false);
    act(() => result.current.toggle("Austin"));
    expect(result.current.edited).toBe(true);

    await act(async () => {
      await result.current.submit();
    });

    expect(mocks.guard).not.toHaveBeenCalled();
    expect(mocks.mutations.set).toHaveBeenCalledWith({
      cities: ["Mexico City"],
    });
    expect(mocks.capture).toHaveBeenCalledWith("public_map_cities_saved", {
      cities: 1,
    });
  });

  it("keeps Save changes disabled with no city picked", () => {
    const { result } = renderHook(() => useMapPage("map"));
    act(() => result.current.toggle("Austin"));
    act(() => result.current.toggle("Mexico City"));
    expect(result.current.edited).toBe(true);
    expect(result.current.canSubmit).toBe(false);
  });

  it("shares the page link", async () => {
    const { result } = renderHook(() => useMapPage("map"));
    await act(async () => {
      await result.current.share();
    });
    expect(mocks.shareUrl).toHaveBeenCalledWith(
      `https://shelvr-web.vercel.app/m/${TOKEN}`,
    );
    expect(mocks.capture).toHaveBeenCalledWith("public_map_shared", {
      shared: true,
      share_ref: "0123456789abcdef",
    });
  });

  it("asks before making a new link", async () => {
    const { result } = renderHook(() => useMapPage("map"));
    act(() => result.current.rotate());
    const confirm = lastAlert();
    expect(confirm.title).toBe("publicMap.newLinkTitle");
    expect(confirm.message).toBe("publicMap.newLinkBody");
    expect(mocks.mutations.rotate).not.toHaveBeenCalled();

    confirm.buttons.find((button) => button.style === "cancel")?.onPress?.();
    expect(mocks.mutations.rotate).not.toHaveBeenCalled();

    await act(async () => {
      confirm.buttons
        .find((button) => button.text === "publicMap.newLink")
        ?.onPress?.();
    });
    expect(mocks.mutations.rotate).toHaveBeenCalledWith({});
    expect(mocks.success).toHaveBeenCalled();
    expect(mocks.capture).toHaveBeenCalledWith("public_map_link_rotated", {});
  });

  it("asks before turning the page off, then shows nothing picked", async () => {
    const { result, rerender } = renderHook(() => useMapPage("map"));
    act(() => result.current.turnOff());
    const confirm = lastAlert();
    expect(confirm.title).toBe("publicMap.turnOffTitle");
    expect(confirm.message).toBe("publicMap.turnOffBody");
    expect(mocks.mutations.off).not.toHaveBeenCalled();

    await act(async () => {
      confirm.buttons
        .find((button) => button.style === "destructive")
        ?.onPress?.();
    });
    expect(mocks.mutations.off).toHaveBeenCalledWith({});
    expect(mocks.capture).toHaveBeenCalledWith("public_map_turned_off", {});

    setData(null, PREVIEWS);
    rerender();
    expect(result.current.status).toBe("off");
    expect(result.current.pickedCount).toBe(0);
  });

  it("says turning the page on again needs Pro to an owner without it", () => {
    mocks.entitlement = { entitled: false, loading: false };
    const { result } = renderHook(() => useMapPage("map"));
    act(() => result.current.turnOff());
    expect(lastAlert().message).toBe("publicMap.turnOffBodyNoPro");
  });

  it("alerts when the new link fails", async () => {
    const failure = new Error("offline");
    mocks.mutations.rotate.mockRejectedValue(failure);
    const { result } = renderHook(() => useMapPage("map"));
    act(() => result.current.rotate());
    await act(async () => {
      lastAlert()
        .buttons.find((button) => button.text === "publicMap.newLink")
        ?.onPress?.();
    });
    expect(mocks.captureError).toHaveBeenCalledWith(
      "public_map_rotate_failed",
      failure,
    );
    expect(mocks.alert).toHaveBeenLastCalledWith("publicMap.failed");
  });
});

describe("useMapPage reporting", () => {
  it("reports the sheet opening once, with its surface", () => {
    setData(undefined, undefined);
    const { rerender } = renderHook(() => useMapPage("settings"));
    expect(mocks.capture).not.toHaveBeenCalled();

    setData(
      { token: TOKEN, cities: ["Mexico City", "Austin"], blocked: false },
      PREVIEWS,
    );
    rerender();
    rerender();
    expect(
      mocks.capture.mock.calls.filter(
        ([event]) => event === "public_map_opened",
      ),
    ).toEqual([
      ["public_map_opened", { on: true, cities: 2, surface: "settings" }],
    ]);
  });

  it("mentions Been there only when a picked city has a visited place", () => {
    const { result } = renderHook(() => useMapPage("map"));
    expect(result.current.showsBeen).toBe(false);
    act(() => result.current.toggle("Austin"));
    expect(result.current.showsBeen).toBe(false);
    act(() => result.current.toggle("Mexico City"));
    expect(result.current.showsBeen).toBe(true);
  });
});
