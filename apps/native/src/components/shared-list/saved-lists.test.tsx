// @vitest-environment jsdom
import type { ReactNode } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SharedListSummary } from "@/lib/shared-lists";
import type { Id } from "@convex/_generated/dataModel";
import { SavedLists } from "./saved-lists";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  refetch: vi.fn(),
  lists: [] as unknown[] | undefined,
  failed: false,
}));

vi.mock("@/lib/analytics", () => ({
  analytics: { capture: vi.fn(), captureError: vi.fn() },
}));
vi.mock("@/lib/share-link", () => ({ shareUrl: vi.fn() }));
vi.mock("@/lib/shared-lists", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/shared-lists")>()),
  useSharedLists: () => ({
    data: mocks.lists,
    isError: mocks.failed,
    refetch: mocks.refetch,
  }),
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
  ActivityIndicator: vi.fn(() => <progress aria-label="Loading" />),
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
  mocks.refetch.mockReset();
  mocks.lists = [];
  mocks.failed = false;
});

describe("SavedLists", () => {
  it("offers to start a list when there is none", () => {
    render(<SavedLists />);
    expect(screen.queryByLabelText("Loading")).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "Start a shared list" }),
    );
    expect(mocks.push).toHaveBeenCalledWith("/new-shared-list");
  });

  it("waits for the lists before offering to start one", () => {
    mocks.lists = undefined;
    render(<SavedLists />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByLabelText("Loading")).toBeTruthy();
  });

  it("offers to retry when the lists fail to load", () => {
    mocks.lists = undefined;
    mocks.failed = true;
    render(<SavedLists />);
    expect(screen.queryByLabelText("Loading")).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Start a shared list" }),
    ).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(mocks.refetch).toHaveBeenCalledOnce();
  });

  it("shows existing lists and offers to create another", () => {
    mocks.lists = [
      summary(),
      summary({ _id: "b" as Id<"sharedLists">, name: "Lisbon" }),
    ];
    render(<SavedLists />);
    expect(screen.getByText("Date spots")).toBeTruthy();
    expect(screen.getByText("Lisbon")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "New list" }));
    expect(mocks.push).toHaveBeenCalledWith("/new-shared-list");
  });
});
