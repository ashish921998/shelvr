// @vitest-environment jsdom
import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { AccountDeletionGate } from "./account-deletion-gate";

const mock = vi.hoisted(() => ({ operation: "idle" }));
vi.mock("@/lib/notifications", () => ({ useNotificationSession: () => mock }));
vi.mock("@/lib/i18n", () => ({ t: (key: string) => key }));
vi.mock("@/components/ui/screen-loader", () => ({
  ScreenLoader: vi.fn(({ label }: { label: string }) => <div>{label}</div>),
}));
function Child({ signedIn = true }: { signedIn?: boolean }) {
  const [route, setRoute] = useState("Home");
  if (!signedIn) return <div>Sign in</div>;
  return (
    <>
      <div>{route}</div>
      <button onClick={() => setRoute("Settings")}>Open settings</button>
    </>
  );
}
beforeEach(() => {
  mock.operation = "idle";
});
it("unmounts children during deletion and resets their state on failure", () => {
  const { rerender } = render(
    <AccountDeletionGate>
      <Child />
    </AccountDeletionGate>,
  );
  fireEvent.click(screen.getByText("Open settings"));
  expect(screen.getByText("Settings")).toBeTruthy();
  mock.operation = "delete_account";
  rerender(
    <AccountDeletionGate>
      <Child />
    </AccountDeletionGate>,
  );
  expect(screen.getByText("account.deleting")).toBeTruthy();
  expect(screen.queryByText("Settings")).toBeNull();
  mock.operation = "idle";
  rerender(
    <AccountDeletionGate>
      <Child />
    </AccountDeletionGate>,
  );
  expect(screen.getByText("Home")).toBeTruthy();
  expect(screen.queryByText("Settings")).toBeNull();
});
it("shows the signed-out child after successful deletion", () => {
  const { rerender } = render(
    <AccountDeletionGate>
      <Child />
    </AccountDeletionGate>,
  );
  mock.operation = "delete_account";
  rerender(
    <AccountDeletionGate>
      <Child />
    </AccountDeletionGate>,
  );
  mock.operation = "idle";
  rerender(
    <AccountDeletionGate>
      <Child signedIn={false} />
    </AccountDeletionGate>,
  );
  expect(screen.getByText("Sign in")).toBeTruthy();
  expect(screen.queryByText("Home")).toBeNull();
});
