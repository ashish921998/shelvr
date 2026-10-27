// @vitest-environment jsdom
import type { ReactNode } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ReviewSaves, type ReviewSave } from "@/components/home/review-saves";

const mock = vi.hoisted(() => ({
  retry: vi.fn(),
  remove: vi.fn(),
  push: vi.fn(),
}));
vi.mock("@/lib/fix-save", () => ({
  useFixSave: () => ({ retry: mock.retry, remove: mock.remove }),
}));
vi.mock("expo-router", () => ({ useRouter: () => ({ push: mock.push }) }));
vi.mock("@/components/onboarding/parts", () => ({
  PillButton: vi.fn(
    ({ label, onPress }: { label: string; onPress: () => void }) => (
      <button onClick={onPress}>{label}</button>
    ),
  ),
}));
vi.mock("@/components/ui/prompt-sheet", () => ({
  PromptSheet: vi.fn(
    ({
      visible,
      title,
      children,
      actions,
    }: {
      visible: boolean;
      title: string;
      children: ReactNode;
      actions: ReactNode;
    }) =>
      visible ? (
        <div role="dialog" aria-label={title}>
          {children}
          {actions}
        </div>
      ) : null,
  ),
}));
vi.mock("react-native-unistyles", () => ({
  StyleSheet: { create: () => ({}), hairlineWidth: 1 },
}));
vi.mock("react-native", () => ({
  View: vi.fn(({ children }: { children: ReactNode }) => (
    <section>{children}</section>
  )),
  ScrollView: vi.fn(({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  )),
  Text: vi.fn(({ children }: { children: ReactNode }) => (
    <span>{children}</span>
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

const save = (s: Partial<ReviewSave> & Pick<ReviewSave, "_id" | "status">) =>
  ({ _creationTime: 0, type: "link", ...s }) as ReviewSave;

const timeout = save({
  _id: "timeout" as ReviewSave["_id"],
  status: "failed",
  url: "https://www.timeout.com/lisbon/restaurants/best-restaurants-in-lisbon",
});
const recipe = save({
  _id: "recipe" as ReviewSave["_id"],
  status: "ready",
  cities: [],
  title: "Sourdough starter",
  siteName: "Wikipedia",
});
const placed = save({
  _id: "placed" as ReviewSave["_id"],
  status: "ready",
  cities: ["Lisbon"],
  title: "Alfama",
});
const reading = save({
  _id: "reading" as ReviewSave["_id"],
  status: "processing",
  title: "New reel",
});

describe("ReviewSaves", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows nothing when every finished save has a city", () => {
    const { container } = render(<ReviewSaves saves={[placed, reading]} />);
    expect(container.textContent).toBe("");
  });

  it("collapses failed and placeless saves into one line that opens a sheet", () => {
    render(<ReviewSaves saves={[timeout, recipe, placed, reading]} />);
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "2 saves without a place, Review" }),
    );
    expect(screen.getByRole("dialog", { name: "Saves without a place" }));
    expect(screen.queryByText("Alfama")).toBeNull();
    expect(screen.queryByText("New reel")).toBeNull();
  });

  it("doesn't reopen on its own after the last save in it goes away", () => {
    const view = render(<ReviewSaves saves={[recipe, placed]} />);
    fireEvent.click(screen.getByText("Review"));
    expect(screen.getByRole("dialog")).toBeTruthy();
    view.rerender(<ReviewSaves saves={[placed]} />);
    view.rerender(<ReviewSaves saves={[timeout, placed]} />);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByText("Review")).toBeTruthy();
  });

  it("names a save by its site, never its raw URL", () => {
    render(<ReviewSaves saves={[timeout, recipe]} />);
    fireEvent.click(screen.getByText("Review"));
    expect(screen.getByText("timeout.com")).toBeTruthy();
    expect(screen.queryByText(/https:/)).toBeNull();
    expect(screen.getByText("Couldn't read this link")).toBeTruthy();
    expect(screen.getByText("Wikipedia · No place in this one")).toBeTruthy();
  });

  it("offers Retry only where the server would rerun the save, and Delete on every row", () => {
    render(<ReviewSaves saves={[timeout, recipe]} />);
    fireEvent.click(screen.getByText("Review"));
    expect(
      screen.queryByRole("button", { name: "Retry, Sourdough starter" }),
    ).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Retry, timeout.com" }));
    expect(mock.retry).toHaveBeenCalledWith(timeout);
    fireEvent.click(
      screen.getByRole("button", { name: "Delete, Sourdough starter" }),
    );
    expect(mock.remove).toHaveBeenCalledWith(recipe);
  });

  it("opens a save from its row and closes the sheet", () => {
    render(<ReviewSaves saves={[recipe]} />);
    fireEvent.click(screen.getByText("Review"));
    fireEvent.click(
      screen.getByRole("button", {
        name: "Sourdough starter, Wikipedia · No place in this one",
      }),
    );
    expect(mock.push).toHaveBeenCalledWith({
      pathname: "/item/[id]",
      params: { id: "recipe", from: "home" },
    });
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
