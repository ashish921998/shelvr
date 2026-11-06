// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EmptyState } from "./empty-state";
import { fadeIn } from "@/lib/motion";

const mocks = vi.hoisted(() => ({
  entering: vi.fn(),
}));
vi.mock("react-native", () => ({
  Text: vi.fn(({ children }: { children: ReactNode }) => (
    <span>{children}</span>
  )),
  View: vi.fn(({ children }: { children: ReactNode }) => (
    <section>{children}</section>
  )),
}));
vi.mock("react-native-unistyles", () => ({
  StyleSheet: { create: () => ({}) },
}));
vi.mock("@/lib/motion", () => ({ fadeIn: Symbol("fadeIn") }));
vi.mock("react-native-reanimated", () => ({
  default: {
    View: vi.fn(
      ({ entering, children }: { entering?: unknown; children: ReactNode }) => {
        mocks.entering(entering);
        return <div>{children}</div>;
      },
    ),
  },
}));

beforeEach(() => mocks.entering.mockClear());

describe("EmptyState", () => {
  it("uses the shared entrance by default and preserves copy", () => {
    render(<EmptyState title="Nothing yet" message="Save something" />);
    expect(screen.getByText("Nothing yet")).toBeTruthy();
    expect(screen.getByText("Save something")).toBeTruthy();
    expect(mocks.entering).toHaveBeenLastCalledWith(fadeIn);
  });

  it("omits the entrance when explicitly opted out", () => {
    render(
      <EmptyState
        title="Nothing yet"
        message="Save something"
        animateEntrance={false}
      />,
    );
    expect(mocks.entering).toHaveBeenLastCalledWith(undefined);
  });

  it("renders its children under the message", () => {
    render(
      <EmptyState title="Nothing yet" message="Save something">
        <button>Add one</button>
      </EmptyState>,
    );
    const message = screen.getByText("Save something");
    const action = screen.getByRole("button", { name: "Add one" });
    expect(action.parentElement?.tagName).toBe("SECTION");
    expect(
      message.compareDocumentPosition(action) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("adds no wrapper without children", () => {
    const { container } = render(
      <EmptyState title="Nothing yet" message="Save something" />,
    );
    expect(container.querySelector("section")).toBeNull();
  });
});
