// @vitest-environment jsdom
import type { ReactNode } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SharedListSummary } from "@/lib/shared-lists";
import type { Id } from "@convex/_generated/dataModel";
import { SharedListCard } from "./list-card";

const mocks = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("@/lib/analytics", () => ({
  analytics: { capture: vi.fn(), captureError: vi.fn() },
}));
vi.mock("@/lib/share-link", () => ({ shareUrl: vi.fn() }));
vi.mock("@/components/shared-list/member-avatars", () => ({
  MemberAvatars: vi.fn(() => null),
}));
vi.mock("@/components/ui/themed-text", () => ({
  ThemedText: vi.fn(({ children }: { children: ReactNode }) => (
    <span>{children}</span>
  )),
}));
vi.mock("expo-router", () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock("react-native-unistyles", () => ({
  StyleSheet: { create: () => ({}) },
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

beforeEach(() => {
  mocks.push.mockReset();
});

function summary(over: Partial<SharedListSummary> = {}): SharedListSummary {
  return {
    _id: "list-1" as Id<"sharedLists">,
    name: "Date night spots",
    placeCount: 5,
    newCount: 0,
    newFrom: [],
    isOwner: true,
    members: [
      { firstName: "Ashish", isYou: true },
      { firstName: "Priya", isYou: false },
    ],
    ...over,
  } as SharedListSummary;
}

describe("SharedListCard", () => {
  it("says who added what in place of the detail line", () => {
    render(
      <SharedListCard
        list={summary({
          newCount: 3,
          newFrom: [{ firstName: "Priya", count: 3 }],
        })}
      />,
    );
    expect(screen.getByText("Priya added 3 places")).toBeTruthy();
    expect(screen.queryByText("With Priya · 5 places")).toBeNull();
    expect(
      screen.getByRole("button", {
        name: "Date night spots, Priya added 3 places, With Priya · 5 places",
      }),
    ).toBeTruthy();
  });

  it("has no badge for new places", () => {
    render(
      <SharedListCard
        list={summary({ newCount: 3, newFrom: [{ count: 3 }] })}
      />,
    );
    expect(screen.getByText("Someone added 3 places")).toBeTruthy();
    expect(screen.queryByText(/\d new$/)).toBeNull();
  });

  it("keeps the detail line when nothing is new, and opens the list", () => {
    render(<SharedListCard list={summary()} />);
    expect(screen.getByText("With Priya · 5 places")).toBeTruthy();
    const card = screen.getByRole("button", {
      name: "Date night spots, With Priya · 5 places",
    });
    fireEvent.click(card);
    expect(mocks.push).toHaveBeenCalledWith({
      pathname: "/shared-list/[id]",
      params: { id: "list-1" },
    });
  });
});
