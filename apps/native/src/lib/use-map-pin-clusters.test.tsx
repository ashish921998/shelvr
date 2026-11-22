// @vitest-environment jsdom
import { renderHook, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";

import { useMapPinClusters } from "./use-map-pin-clusters";

const mock = vi.hoisted(() => ({ load: vi.fn(), captureError: vi.fn() }));

vi.mock("expo-image", () => ({ Image: { loadAsync: mock.load } }));
vi.mock("@/lib/analytics", () => ({
  analytics: { captureError: mock.captureError },
}));
vi.mock("@/components/map/map-cluster-sheet", () => ({
  MapClusterSheet: vi.fn(() => null),
}));
vi.mock("@/lib/i18n", () => ({
  useAppLocale: () => "en",
  t: (key: string) => key,
}));
vi.mock("react-native-unistyles", () => ({
  useUnistyles: () => ({
    theme: { colors: { frame: "#ffffff", primary: "#amber" } },
    rt: { screen: { width: 390 } },
  }),
}));

it("retries a failed badge on the next map, then shares one image that outlives each map", async () => {
  const error = new Error("decode");
  const icon = { release: vi.fn() };
  mock.load.mockRejectedValueOnce(error).mockResolvedValue(icon);
  const pins = [{ id: "a", name: "Ramen", lat: 30, lng: -97, visited: true }];
  const open = () => renderHook(() => useMapPinClusters(pins, vi.fn()));

  const failed = open();
  await waitFor(() =>
    expect(mock.captureError).toHaveBeenCalledWith(
      "map_visited_badge_failed",
      error,
    ),
  );
  expect(failed.result.current.badges).toEqual([]);
  failed.unmount();

  const first = open();
  await waitFor(() => expect(first.result.current.badges).toHaveLength(1));
  first.unmount();

  const second = open();
  await waitFor(() => expect(second.result.current.badges[0]?.icon).toBe(icon));
  expect(mock.load).toHaveBeenCalledTimes(2);
  expect(icon.release).not.toHaveBeenCalled();
});
