// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { cardFileName, useCityCardShare } from "@/lib/use-city-card-share";

const mocks = vi.hoisted(() => ({
  image: { encodeToBytes: () => new Uint8Array([1]) } as {
    encodeToBytes: () => Uint8Array;
  } | null,
  shareAsync: vi.fn(),
  capture: vi.fn(),
  captureError: vi.fn(),
  alert: vi.fn(),
}));

vi.mock("@shopify/react-native-skia", () => ({
  makeImageFromView: vi.fn(async () => mocks.image),
}));
vi.mock("expo-file-system", () => ({
  File: class {
    uri = "file:///cache/shelvr-austin.png";
    exists = false;
    delete() {}
    async write() {}
  },
  Paths: { cache: "cache" },
}));
vi.mock("expo-sharing", () => ({
  isAvailableAsync: async () => true,
  shareAsync: mocks.shareAsync,
}));
vi.mock("@/lib/analytics", () => ({
  analytics: { capture: mocks.capture, captureError: mocks.captureError },
}));
vi.mock("@/lib/i18n", () => ({ t: (key: string) => key }));
vi.mock("react-native", () => ({ Alert: { alert: mocks.alert } }));

const counts = { place_count: 3, visited_count: 1 };

async function share() {
  const { result } = renderHook(() =>
    useCityCardShare({ current: null }, "Austin", counts),
  );
  await act(() => result.current.share());
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.image = { encodeToBytes: () => new Uint8Array([1]) };
  mocks.shareAsync.mockResolvedValue(undefined);
});

describe("cardFileName", () => {
  it("names the image after the city, safely", () => {
    expect(cardFileName("São Paulo")).toBe("shelvr-sao-paulo.png");
    expect(cardFileName("New York City")).toBe("shelvr-new-york-city.png");
    expect(cardFileName("東京")).toBe("shelvr-city.png");
  });
});

describe("useCityCardShare", () => {
  it("records the share sheet opening with the card's counts, not a share", async () => {
    await share();
    expect(mocks.shareAsync).toHaveBeenCalledWith(
      "file:///cache/shelvr-austin.png",
      expect.objectContaining({ mimeType: "image/png" }),
    );
    expect(mocks.capture.mock.calls).toEqual([
      ["city_card_share_sheet_opened", counts],
    ]);
  });

  it("reports a card it could not draw and records no share sheet", async () => {
    mocks.image = null;
    await share();
    expect(mocks.shareAsync).not.toHaveBeenCalled();
    expect(mocks.capture).not.toHaveBeenCalled();
    expect(mocks.captureError).toHaveBeenCalledWith(
      "city_card_share_failed",
      expect.any(Error),
    );
    expect(mocks.alert).toHaveBeenCalledWith(
      "errors.unexpectedTitle",
      "errors.tryAgain",
    );
  });
});
