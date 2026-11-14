// @vitest-environment jsdom
import type { ReactNode } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SharedListSummary } from "@/lib/shared-lists";
import type { Id } from "@convex/_generated/dataModel";
import { TogetherSection } from "./together-section";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  lists: [] as unknown[],
}));

vi.mock("@/lib/analytics", () => ({
  analytics: { capture: vi.fn(), captureError: vi.fn() },
}));
vi.mock("@/lib/share-link", () => ({ shareUrl: vi.fn() }));
vi.mock("@/lib/shared-lists", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/shared-lists")>()),
  useSharedLists: () => ({ data: mocks.lists }),
}));
vi.mock("@/components/shared-list/list-card", () => ({
  SharedListCard: vi.fn(({ list }: { list: { name: string } }) => (
    <p>{list.name}</p>
  )),
}));
vi.mock("@/components/ui/themed-text", () => ({
  ThemedText: vi.fn(({ children }: { children: ReactNode }) => (
    <span>{children}</span>
  )),
}));
vi.mock("expo-router", () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock("react-native-unistyles", () => ({
  StyleSheet: { create: () => ({}) },
  useUnistyles: () => ({ theme: { colors: { muted: "#999" } } }),
}));
vi.mock("react-native", () => ({
  View: vi.fn(({ children }: { children: ReactNode }) => (
    <section>{children}</section>
  )),
  Pressable: vi.fn(
    ({
      children,
      onPress,
      accessibilityLabel,
    }: {
      children: ReactNode;
      onPress: () => void;
      accessibilityLabel?: string;
    }) => (
      <button onClick={onPress} aria-label={accessibilityLabel}>
        {children}
      </button>
    ),
  ),
}));

function summary(over: Partial<SharedListSummary> = {}): SharedListSummary {
  return {
    _id: "list-1" as Id<"sharedLists">,
    name: "Date spots",
    placeCount: 5,
    newCount: 0,
    newFrom: [],
    isOwner: true,
    members: [],
    ...over,
  } as SharedListSummary;
}

beforeEach(() => {
  mocks.push.mockReset();
  mocks.lists = [];
});

describe("TogetherSection", () => {
  it("offers to start a list when there is none", () => {
    render(<TogetherSection showTripsHeading={false} />);
    expect(screen.getByText("Together")).toBeTruthy();
    expect(screen.queryByText("Trips")).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "Start a shared list" }),
    );
    expect(mocks.push).toHaveBeenCalledWith("/new-shared-list");
  });

  it("lists shared lists above the trips heading", () => {
    mocks.lists = [
      summary(),
      summary({ _id: "b" as Id<"sharedLists">, name: "Lisbon" }),
    ];
    render(<TogetherSection showTripsHeading />);
    expect(screen.getByText("Date spots")).toBeTruthy();
    expect(screen.getByText("Lisbon")).toBeTruthy();
    expect(screen.getByText("Trips")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "New list" }));
    expect(mocks.push).toHaveBeenCalledWith("/new-shared-list");
  });
});
