// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { expect, it, vi } from "vitest";
import { SharedTripsSection } from "./shared-trips-section";

const mocks = vi.hoisted(() => ({
  failed: true,
  push: vi.fn(),
  captureError: vi.fn(),
}));

vi.mock("@/lib/analytics", () => ({
  analytics: { captureError: mocks.captureError },
}));
vi.mock("@/lib/trip-planner", () => ({ tripName: () => "Austin trip" }));
vi.mock("@/components/ui/button", () => ({
  Button: vi.fn(
    ({ title, onPress }: { title: string; onPress: () => void }) => (
      <button type="button" onClick={onPress}>
        {title}
      </button>
    ),
  ),
}));
vi.mock("@/components/ui/themed-text", () => ({
  ThemedText: vi.fn(({ children }: { children: ReactNode }) => (
    <span>{children}</span>
  )),
}));
vi.mock("expo-router", () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock("convex/react", () => ({
  usePaginatedQuery: () => {
    if (mocks.failed) throw new Error("Shared trips unavailable");
    return { results: [{ _id: "trip" }], status: "Exhausted" };
  },
}));

it("isolates a shared trips failure and can retry from the plan gate", () => {
  render(
    <>
      <SharedTripsSection />
      <button type="button">See plans</button>
    </>,
    { onCaughtError: () => {} },
  );
  expect(screen.getByRole("button", { name: "See plans" })).toBeTruthy();
  expect(mocks.captureError).toHaveBeenCalledWith(
    "shared_trips_load_failed",
    expect.any(Error),
  );
  mocks.failed = false;
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  fireEvent.click(screen.getByRole("button", { name: "Austin trip" }));
  expect(mocks.push).toHaveBeenCalledWith({
    pathname: "/trip-plan/[id]",
    params: { id: "trip" },
  });
});
