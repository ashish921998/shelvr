// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useTripToContinue } from "./use-trip-to-continue";

const mocks = vi.hoisted(() => ({
  args: [] as { from: string; to: string }[],
  data: [] as {
    _id: string;
    city: string;
    startDate: string;
    dayCount: number;
  }[],
  appState: undefined as ((state: string) => void) | undefined,
}));

vi.mock("@/lib/i18n", () => ({
  t: (key: string) => key,
  formattingLocale: () => "en-US",
}));
vi.mock("@/lib/use-report-load-failure", () => ({
  useReportLoadFailure: vi.fn(),
}));
vi.mock("@convex/_generated/api", () => ({
  api: { tripPlannerData: { listTripsStarting: "listTripsStarting" } },
}));
vi.mock("@convex-dev/react-query", () => ({
  convexQuery: (_fn: string, args: { from: string; to: string }) => {
    mocks.args.push(args);
    return args;
  },
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: mocks.data, error: null, isSuccess: true }),
}));
vi.mock("react-native", () => ({
  Platform: { OS: "ios" },
  AppState: {
    addEventListener: (_event: string, listener: (state: string) => void) => {
      mocks.appState = listener;
      return { remove: vi.fn() };
    },
  },
}));

beforeEach(() => {
  vi.useFakeTimers();
  mocks.args = [];
  mocks.data = [
    { _id: "kyoto", city: "Kyoto", startDate: "2026-11-16", dayCount: 3 },
  ];
});
afterEach(() => vi.useRealTimers());

it("asks for trips that could be under way or start within three days", () => {
  vi.setSystemTime(new Date(2026, 10, 18, 9));
  const { result } = renderHook(() => useTripToContinue());
  expect(mocks.args.at(-1)).toEqual({ from: "2026-11-04", to: "2026-11-21" });
  expect(result.current?.trip._id).toBe("kyoto");
});

it("moves to the next day at midnight and when the app comes back", () => {
  vi.setSystemTime(new Date(2026, 10, 18, 23, 59));
  const { result } = renderHook(() => useTripToContinue());
  act(() => vi.advanceTimersByTime(2 * 60 * 1000));
  expect(mocks.args.at(-1)).toEqual({ from: "2026-11-05", to: "2026-11-22" });
  expect(result.current).toBeNull();

  vi.setSystemTime(new Date(2026, 10, 25, 8));
  act(() => mocks.appState?.("active"));
  expect(mocks.args.at(-1)).toEqual({ from: "2026-11-11", to: "2026-11-28" });
});
