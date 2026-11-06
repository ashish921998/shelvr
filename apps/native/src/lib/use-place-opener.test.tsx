// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { useEffect } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import type { StopAction } from "@/lib/trip-planner";
import { usePlaceOpener } from "@/lib/use-place-opener";

const mocks = vi.hoisted(() => ({
  focused: true,
  push: vi.fn(),
  openUrl: vi.fn(),
  captureError: vi.fn(),
  openPlaceDetails: vi.fn(),
  cancelPlaceDetails: vi.fn(),
}));

vi.mock("@/lib/analytics", () => ({
  analytics: { captureError: mocks.captureError },
}));
vi.mock("@/lib/apple-place-card", () => ({
  openPlaceDetails: mocks.openPlaceDetails,
  cancelPlaceDetails: mocks.cancelPlaceDetails,
}));
vi.mock("expo-router", () => ({
  useRouter: () => ({ push: mocks.push }),
  useFocusEffect: (effect: () => undefined | (() => void)) => {
    const focused = mocks.focused;
    useEffect(() => (focused ? effect() : undefined), [effect, focused]);
  },
}));
vi.mock("react-native", () => ({ Linking: { openURL: mocks.openUrl } }));

const SAVE: StopAction = { kind: "save", itemId: "item-1" as never };
const CARD: StopAction = { kind: "card", appleId: "apple-1" };
const MAPS: StopAction = { kind: "maps", url: "https://maps.example/1" };

function setup(fallback: StopAction = MAPS) {
  const actionFor = vi.fn<
    (place: object, cardAvailable: boolean) => StopAction
  >(() => fallback);
  return {
    actionFor,
    ...renderHook(() => usePlaceOpener(actionFor, "test_maps_failed")),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.focused = true;
  mocks.openUrl.mockResolvedValue(true);
});

it("opens a save", () => {
  const { result } = setup();
  result.current.open({}, SAVE);
  expect(mocks.push).toHaveBeenCalledWith({
    pathname: "/item/[id]",
    params: { id: "item-1" },
  });
});

it("opens Maps and reports the event it was given when that fails", async () => {
  const failure = new Error("no");
  mocks.openUrl.mockRejectedValue(failure);
  const { result } = setup();
  await act(async () => result.current.open({}, MAPS));
  expect(mocks.openUrl).toHaveBeenCalledWith(MAPS.url);
  expect(mocks.captureError).toHaveBeenCalledWith("test_maps_failed", failure);
});

it.each([
  ["a save", SAVE, () => expect(mocks.push).toHaveBeenCalledTimes(1)],
  ["Maps", MAPS, () => expect(mocks.openUrl).toHaveBeenCalledTimes(1)],
])("falls back from a missing card to %s", (_, fallback, check) => {
  const place = { name: "Cafe" };
  const { result, actionFor } = setup(fallback);
  result.current.open(place, CARD);
  expect(mocks.openPlaceDetails).toHaveBeenCalledWith(
    "apple-1",
    expect.any(Function),
  );
  expect(actionFor).not.toHaveBeenCalled();
  (mocks.openPlaceDetails.mock.calls[0]?.[1] as () => void)();
  expect(actionFor).toHaveBeenCalledWith(place, false);
  check();
});

it("does nothing, and cancels a pending card, once the screen has left", () => {
  const { result, rerender } = setup();
  result.current.open({}, CARD);
  mocks.focused = false;
  rerender();
  expect(mocks.cancelPlaceDetails).toHaveBeenCalledTimes(1);
  (mocks.openPlaceDetails.mock.calls[0]?.[1] as () => void)();
  expect(mocks.openUrl).not.toHaveBeenCalled();
  result.current.open({}, SAVE);
  expect(mocks.push).not.toHaveBeenCalled();
  expect(result.current.focused.current).toBe(false);
});
