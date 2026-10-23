// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { Component, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AccountGoneBoundary } from "./account-gone-boundary";

const mock = vi.hoisted(() => ({
  currentUser: undefined as { _id: string } | null | undefined,
  useQuery: vi.fn(),
}));
vi.mock("convex/react", () => ({ useQuery: mock.useQuery }));
vi.mock("@convex/_generated/api", () => ({
  api: { users: { getCurrentUser: "users:getCurrentUser" } },
}));
vi.mock("@/components/ui/screen-loader", () => ({
  ScreenLoader: vi.fn(() => <div>loader</div>),
}));
vi.mock("@/lib/i18n", () => ({ t: (key: string) => key }));

const failure = new Error("[CONVEX Q(items:listItemsPage)] Server Error");

function Throws(): ReactNode {
  throw failure;
}

class Root extends Component<{ children: ReactNode }, { error?: unknown }> {
  override state: { error?: unknown } = {};
  static getDerivedStateFromError(error: unknown) {
    return { error };
  }
  override render() {
    return this.state.error === undefined ? (
      this.props.children
    ) : (
      <div>root: {String(this.state.error)}</div>
    );
  }
}

function renderFailingTree() {
  return render(
    <Root>
      <AccountGoneBoundary signedIn>
        <Throws />
      </AccountGoneBoundary>
    </Root>,
  );
}

describe("AccountGoneBoundary", () => {
  beforeEach(() => {
    mock.useQuery.mockImplementation(() => mock.currentUser);
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it("renders its children when nothing throws", () => {
    render(
      <AccountGoneBoundary signedIn>
        <div>feed</div>
      </AccountGoneBoundary>,
    );
    expect(screen.getByText("feed")).toBeTruthy();
    expect(mock.useQuery).not.toHaveBeenCalled();
  });

  it("shows the loader when the server says the account is gone", () => {
    mock.currentUser = null;
    renderFailingTree();
    expect(screen.getByText("loader")).toBeTruthy();
    expect(mock.useQuery).toHaveBeenCalledWith("users:getCurrentUser");
  });

  it("shows the loader while the account check is pending", () => {
    mock.currentUser = undefined;
    renderFailingTree();
    expect(screen.getByText("loader")).toBeTruthy();
  });

  it("rethrows to the root boundary when the account still exists", () => {
    mock.currentUser = { _id: "users:1" };
    renderFailingTree();
    expect(screen.getByText(`root: ${String(failure)}`)).toBeTruthy();
    expect(screen.queryByText("loader")).toBeNull();
  });
});
