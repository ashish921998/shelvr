// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { expect, it, vi } from "vitest";

import type { DetailItem } from "@/components/item-detail";
import { useItemShare } from "@/lib/use-item-share";

const mocks = vi.hoisted(() => ({ capture: vi.fn() }));

vi.mock("@/lib/i18n", () => ({
  t: (key: string) => key,
  useAppLocale: () => undefined,
}));
vi.mock("@/lib/analytics", () => ({
  analytics: {
    capture: mocks.capture,
    captureError: vi.fn(),
    itemAction: vi.fn(),
  },
}));
vi.mock("@/lib/share-link", () => ({
  shareRefOf: async () => "ref1",
  shareUrl: async () => ({ action: "sharedAction" }),
  useShareLink: () => async () => "https://shelvr.app/s/ref1",
  useSettleShareLink: () => vi.fn(),
}));
vi.mock("expo-file-system", () => ({ File: vi.fn(), Paths: {} }));
vi.mock("expo-sharing", () => ({
  isAvailableAsync: vi.fn(),
  shareAsync: vi.fn(),
}));
vi.mock("react-native", () => ({
  Share: { share: vi.fn(), dismissedAction: "dismissedAction" },
}));

it("reports the surface a share came from", async () => {
  const link = {
    _id: "abc",
    type: "link",
    url: "https://a.example",
  } as unknown as DetailItem;
  const { result } = renderHook(() => useItemShare(link, "feed"));
  await act(() => result.current());
  expect(mocks.capture).toHaveBeenCalledWith("item_shared", {
    surface: "feed",
    share_ref: "ref1",
  });
});
