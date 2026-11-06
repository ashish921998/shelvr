// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Id } from "@convex/_generated/dataModel";
import type { SharedListDetail } from "@/lib/shared-lists";
import { ListHeaderRight } from "./list-header-right";

type PressableProps = {
  children: ReactNode | ((state: { pressed: boolean }) => ReactNode);
  onPress?: () => void;
  accessibilityLabel?: string;
};

type NameSheetProps = {
  visible: boolean;
  kind: string;
  onDone: () => void;
  onCancel: () => void;
};

const mocks = vi.hoisted(() => ({
  shareInvite: vi.fn(),
  nameGate: {
    gate: vi.fn(),
    asking: false,
    finish: vi.fn(),
    cancel: vi.fn(),
  },
}));

vi.mock("expo-router", () => ({
  Stack: {
    Screen: vi.fn(
      ({ options }: { options: { headerRight?: () => ReactNode } }) => (
        <div>{options.headerRight?.()}</div>
      ),
    ),
  },
  useRouter: () => ({ replace: vi.fn() }),
}));
vi.mock("@/lib/shared-lists", () => ({
  shareInvite: mocks.shareInvite,
  useNameGate: () => mocks.nameGate,
}));
vi.mock("@/components/shared-list/name-sheet", () => ({
  NameSheet: vi.fn(({ visible, kind, onDone, onCancel }: NameSheetProps) =>
    visible ? (
      <div>
        <span>{`name-sheet:${kind}`}</span>
        <button type="button" onClick={onDone}>
          done
        </button>
        <button type="button" onClick={onCancel}>
          cancel
        </button>
      </div>
    ) : null,
  ),
}));
vi.mock("@/components/shared-list/member-avatars", () => ({
  MemberAvatars: vi.fn(() => null),
}));
vi.mock("@/components/glass", () => ({ hasLiquidGlass: false }));
vi.mock("@/components/symbol", () => ({ AppSymbolIcon: vi.fn(() => null) }));
vi.mock("@/components/ui/action-menu", () => ({
  ActionMenu: vi.fn(() => null),
}));
vi.mock("@/components/ui/themed-text", () => ({
  ThemedText: vi.fn(({ children }: { children: ReactNode }) => (
    <span>{children}</span>
  )),
}));
vi.mock("convex/react", () => ({ useMutation: () => vi.fn() }));
vi.mock("@convex/_generated/api", () => ({
  api: { sharedLists: { leaveSharedList: "leaveSharedList" } },
}));
vi.mock("@/lib/analytics", () => ({
  analytics: { capture: vi.fn(), captureError: vi.fn() },
}));
vi.mock("@/lib/i18n", () => ({ t: (key: string) => key }));
vi.mock("react-native", () => ({
  Alert: { alert: vi.fn() },
  View: vi.fn(({ children }: { children: ReactNode }) => <div>{children}</div>),
  Pressable: vi.fn(
    ({ children, onPress, accessibilityLabel }: PressableProps) => (
      <button type="button" aria-label={accessibilityLabel} onClick={onPress}>
        {typeof children === "function"
          ? children({ pressed: false })
          : children}
      </button>
    ),
  ),
}));
vi.mock("react-native-unistyles", () => ({
  StyleSheet: { create: () => ({}) },
  useUnistyles: () => ({ theme: { colors: { foreground: "foreground" } } }),
}));

const DETAIL = {
  _id: "list1" as Id<"sharedLists">,
  name: "Maya’s Mexico City",
  inviteToken: "invite-token",
  isOwner: true,
  members: [],
} as unknown as SharedListDetail;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.nameGate.asking = false;
});
afterEach(() => cleanup());

describe("ListHeaderRight invite", () => {
  it("asks for a first name before the share sheet opens", () => {
    render(<ListHeaderRight detail={DETAIL} />);
    fireEvent.click(screen.getByLabelText("sharedLists.invite"));
    expect(mocks.nameGate.gate).toHaveBeenCalledTimes(1);
    expect(mocks.shareInvite).not.toHaveBeenCalled();
    const [action] = mocks.nameGate.gate.mock.calls[0] as [() => void];
    action();
    expect(mocks.shareInvite).toHaveBeenCalledWith("invite-token", "list");
  });

  it("shows the name sheet while asking, and passes on its answers", () => {
    mocks.nameGate.asking = true;
    render(<ListHeaderRight detail={DETAIL} />);
    expect(screen.getByText("name-sheet:create")).toBeTruthy();
    fireEvent.click(screen.getByText("done"));
    expect(mocks.nameGate.finish).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByText("cancel"));
    expect(mocks.nameGate.cancel).toHaveBeenCalledTimes(1);
  });

  it("shows no sheet when nothing is being asked", () => {
    render(<ListHeaderRight detail={DETAIL} />);
    expect(screen.queryByText(/^name-sheet:/)).toBeNull();
  });
});
