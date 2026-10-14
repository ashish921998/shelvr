// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PostHogScreenTracking } from "@/lib/posthog-screen-tracking";

const mocks = vi.hoisted(() => ({
  segments: [] as string[],
  screen: vi.fn(),
}));

vi.mock("expo-router", () => ({
  useSegments: () => mocks.segments,
}));
vi.mock("@/lib/analytics", () => ({
  analytics: { screen: mocks.screen },
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.segments = [];
});
afterEach(cleanup);

it.each([
  [["(app)", "tidy"], "(app)/(tabs)/(tidy)"],
  [["(app)", "map"], "(app)/(tabs)/(map)"],
  [["(app)", "(tabs)", "(tidy)"], "(app)/(tabs)/(tidy)"],
  [["(app)", "(tabs)", "(map)"], "(app)/(tabs)/(map)"],
  [[], "index"],
  [["(app)", "(tabs)", "(home)"], "(app)/(tabs)/(home)"],
  [["(app)", "profile"], "(app)/profile"],
  [["(auth)", "sign-in"], "(auth)/sign-in"],
  [["(app)", "item", "[id]"], "(app)/item/[id]"],
  [["(app)", "space", "[id]"], "(app)/space/[id]"],
  [["(app)", "digest", "[id]"], "(app)/digest/[id]"],
  [["(app)", "tidy", "[id]"], "(app)/tidy/[id]"],
])("tracks segments %j as %s", (segments, expected) => {
  mocks.segments = segments;
  render(<PostHogScreenTracking />);
  expect(mocks.screen).toHaveBeenCalledExactlyOnceWith(expected);
});

it("tracks route changes but not rerenders of the same route", () => {
  mocks.segments = ["(app)", "tidy"];
  const { rerender } = render(<PostHogScreenTracking />);
  mocks.segments = ["(app)", "tidy"];
  rerender(<PostHogScreenTracking />);
  expect(mocks.screen).toHaveBeenCalledTimes(1);

  mocks.segments = ["(app)", "map"];
  rerender(<PostHogScreenTracking />);
  expect(mocks.screen.mock.calls).toEqual([
    ["(app)/(tabs)/(tidy)"],
    ["(app)/(tabs)/(map)"],
  ]);
});
