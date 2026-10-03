// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { RootErrorBoundary } from "./root-error-boundary";

const mock = vi.hoisted(() => ({ captureError: vi.fn() }));

vi.mock("@/lib/analytics", () => ({
  analytics: { captureError: mock.captureError },
}));
vi.mock("react-native", () => ({
  View: vi.fn((props: { children?: React.ReactNode }) => (
    <div>{props.children}</div>
  )),
  Text: vi.fn((props: { children?: React.ReactNode }) => (
    <span>{props.children}</span>
  )),
  Pressable: vi.fn(
    (props: { children?: React.ReactNode; onPress?: () => void }) => (
      <button onClick={props.onPress}>{props.children}</button>
    ),
  ),
}));
vi.mock("react-native-unistyles", () => ({
  StyleSheet: { create: (styles: unknown) => styles },
}));

describe("RootErrorBoundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reports the render error and retries by remounting the tree", async () => {
    const retry = vi.fn();
    render(<RootErrorBoundary error={new Error("boom")} retry={retry} />);
    await waitFor(() =>
      expect(mock.captureError).toHaveBeenCalledWith(
        "render_error",
        expect.any(Error),
      ),
    );
    expect(screen.getByText("Something went wrong")).toBeTruthy();
    fireEvent.click(screen.getByRole("button"));
    expect(retry).toHaveBeenCalledOnce();
  });
});
