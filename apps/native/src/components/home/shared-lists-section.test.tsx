// @vitest-environment jsdom
import type { ReactNode } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SharedListSummary } from "@/lib/shared-lists";
import type { Id } from "@convex/_generated/dataModel";
import { SharedListsSection } from "./shared-lists-section";

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
vi.mock("@/components/symbol", () => ({ AppSymbolIcon: vi.fn(() => null) }));
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

describe("SharedListsSection", () => {
  it("shows nothing until there is a shared list", () => {
    const { container } = render(<SharedListsSection />);
    expect(container.textContent).toBe("");
  });

  it("shows a quiet list without a See all action when it is the only list", () => {
    mocks.lists = [summary()];
    render(<SharedListsSection />);
    expect(screen.getByRole("button", { name: /^Date spots/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "See all" })).toBeNull();
  });

  it("opens the full collection when there is more than one list", () => {
    mocks.lists = [summary(), summary({ name: "Another list" })];
    render(<SharedListsSection />);
    expect(screen.queryByText("Another list")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "See all" }));
    expect(mocks.push).toHaveBeenCalledWith("/shared-lists");
  });

  it("shows the first list with news in one row and opens it", () => {
    mocks.lists = [
      summary({ _id: "quiet" as Id<"sharedLists">, name: "Quiet" }),
      summary({
        _id: "busy" as Id<"sharedLists">,
        name: "Date spots",
        newCount: 3,
        newFrom: [{ firstName: "Priya", count: 3 }],
      }),
    ];
    render(<SharedListsSection />);
    const nudge = screen.getByRole("button", {
      name: /^Date spots, Priya added 3 places/,
    });
    expect(screen.queryByText("Quiet")).toBeNull();
    fireEvent.click(nudge);
    expect(mocks.push).toHaveBeenCalledWith({
      pathname: "/shared-list/[id]",
      params: { id: "busy" },
    });
  });
});
