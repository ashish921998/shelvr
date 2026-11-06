import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  mapPageCities,
  mapPageStatus,
  publicMapUrl,
  sameCities,
  sharePublicMap,
} from "./public-map";

const mocks = vi.hoisted(() => ({
  capture: vi.fn(),
  captureError: vi.fn(),
  shareUrl: vi.fn(),
}));
vi.mock("react-native", () => ({
  Alert: { alert: vi.fn() },
  Platform: { OS: "ios" },
  Share: { sharedAction: "sharedAction", dismissedAction: "dismissedAction" },
}));
vi.mock("@/lib/analytics", () => ({
  analytics: { capture: mocks.capture, captureError: mocks.captureError },
}));
vi.mock("@/lib/entitlement", () => ({
  useEntitlement: vi.fn(),
  usePaywallGuard: vi.fn(),
}));
vi.mock("@/lib/haptics", () => ({ haptics: { success: vi.fn() } }));
vi.mock("@/lib/i18n", () => ({ t: (key: string) => key }));
vi.mock("@/lib/share-link", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/share-link")>()),
  shareUrl: mocks.shareUrl,
}));
vi.mock("expo-crypto", () => ({
  CryptoDigestAlgorithm: { SHA256: "SHA-256" },
  digestStringAsync: async (_algorithm: string, value: string) =>
    createHash("sha256").update(value).digest("hex"),
}));
vi.mock("convex/react", () => ({ useMutation: vi.fn() }));
vi.mock("@tanstack/react-query", () => ({ useQuery: vi.fn() }));
vi.mock("@convex-dev/react-query", () => ({ convexQuery: vi.fn() }));

const TOKEN = "0123456789abcdef0123456789abcdef";

afterEach(() => {
  vi.unstubAllEnvs();
  mocks.capture.mockReset();
  mocks.captureError.mockReset();
  mocks.shareUrl.mockReset();
});

function preview(city: string, places = 1) {
  return {
    city,
    places: Array.from({ length: places }, (_, index) => ({
      name: `${city} ${index + 1}`,
      went: false,
    })),
  };
}

describe("publicMapUrl", () => {
  it("builds the map page link on the website", () => {
    vi.stubEnv("EXPO_PUBLIC_WEB_URL", "");
    expect(publicMapUrl(TOKEN)).toBe(
      `https://shelvr-web.vercel.app/m/${TOKEN}`,
    );
  });

  it("follows the configured web origin and encodes the token", () => {
    vi.stubEnv("EXPO_PUBLIC_WEB_URL", "http://localhost:3000");
    expect(publicMapUrl("a b/c")).toBe("http://localhost:3000/m/a%20b%2Fc");
  });
});

describe("sameCities", () => {
  it("ignores order, case and spacing", () => {
    expect(
      sameCities(["Austin", " mexico  city "], ["Mexico City", "austin"]),
    ).toBe(true);
    expect(sameCities([], [])).toBe(true);
  });

  it("tells a different set apart", () => {
    expect(sameCities(["Austin"], ["Austin", "Lisbon"])).toBe(false);
    expect(sameCities(["Austin"], ["Lisbon"])).toBe(false);
  });
});

describe("mapPageCities", () => {
  it("lists the previews in order, then page cities that have no places now", () => {
    const rows = mapPageCities(
      [preview("Mexico City", 4), preview("Austin", 2)],
      ["austin", "Lisbon"],
      ["AUSTIN", "Lisbon"],
    );
    expect(
      rows.map((row) => [row.city, row.places.length, row.picked]),
    ).toEqual([
      ["Mexico City", 4, false],
      ["Austin", 2, true],
      ["Lisbon", 0, true],
    ]);
    expect(rows.every((row) => !row.disabled)).toBe(true);
  });

  it("disables the unpicked rows once twelve cities are picked", () => {
    const previews = Array.from({ length: 13 }, (_, index) =>
      preview(`City ${index + 1}`),
    );
    const picked = previews.slice(0, 12).map((row) => row.city);
    const rows = mapPageCities(previews, null, picked);
    expect(rows.filter((row) => row.disabled).map((row) => row.city)).toEqual([
      "City 13",
    ]);
    expect(rows.filter((row) => row.picked)).toHaveLength(12);
  });
});

describe("mapPageStatus", () => {
  it("puts an error before loading", () => {
    expect(
      mapPageStatus({ isError: true, page: undefined, previews: undefined }),
    ).toBe("error");
    expect(
      mapPageStatus({ isError: false, page: undefined, previews: [] }),
    ).toBe("loading");
    expect(
      mapPageStatus({ isError: false, page: null, previews: undefined }),
    ).toBe("loading");
  });

  it("then tells blocked, empty, off and on apart", () => {
    expect(
      mapPageStatus({ isError: false, page: { blocked: true }, previews: [] }),
    ).toBe("blocked");
    expect(mapPageStatus({ isError: false, page: null, previews: [] })).toBe(
      "empty",
    );
    expect(
      mapPageStatus({ isError: false, page: null, previews: [preview("A")] }),
    ).toBe("off");
    expect(
      mapPageStatus({ isError: false, page: { blocked: false }, previews: [] }),
    ).toBe("on");
  });
});

describe("sharePublicMap", () => {
  const shareRef = createHash("sha256")
    .update(TOKEN)
    .digest("hex")
    .slice(0, 16);

  it("shares the link and reports the same share_ref as the web page", async () => {
    vi.stubEnv("EXPO_PUBLIC_WEB_URL", "");
    mocks.shareUrl.mockResolvedValue({ action: "sharedAction" });
    expect(await sharePublicMap(TOKEN)).toBe(true);
    expect(mocks.shareUrl).toHaveBeenCalledWith(
      `https://shelvr-web.vercel.app/m/${TOKEN}`,
    );
    expect(mocks.capture).toHaveBeenCalledWith("public_map_shared", {
      shared: true,
      share_ref: shareRef,
    });
  });

  it("reports a dismissed share sheet as not shared", async () => {
    mocks.shareUrl.mockResolvedValue({ action: "dismissedAction" });
    expect(await sharePublicMap(TOKEN)).toBe(false);
    expect(mocks.capture).toHaveBeenCalledWith("public_map_shared", {
      shared: false,
      share_ref: shareRef,
    });
  });

  it("reports a failed share sheet without throwing", async () => {
    const failure = new Error("no sheet");
    mocks.shareUrl.mockRejectedValue(failure);
    expect(await sharePublicMap(TOKEN)).toBe(false);
    expect(mocks.captureError).toHaveBeenCalledWith(
      "public_map_share_failed",
      failure,
    );
    expect(mocks.capture).not.toHaveBeenCalled();
  });
});
