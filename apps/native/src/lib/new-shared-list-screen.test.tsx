// @vitest-environment jsdom
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { expect, it, vi } from "vitest";
import NewSharedListScreen from "@/app/(app)/new-shared-list";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  back: vi.fn(),
  replace: vi.fn(),
  shareInvite: vi.fn(),
}));

vi.mock("@/lib/analytics", () => ({
  analytics: { capture: vi.fn(), captureError: vi.fn() },
}));
vi.mock("@/lib/entitlement", () => ({
  usePaywallGuard: () => ({ guard: async () => true, loading: false }),
}));
vi.mock("@/lib/haptics", () => ({ haptics: { success: vi.fn() } }));
vi.mock("@/lib/shared-lists", () => ({
  shareInvite: mocks.shareInvite,
  useNameGate: () => ({}),
  useTypedCity: () => ({ typed: "", change: vi.fn(), commit: vi.fn() }),
}));
vi.mock("@/lib/screen-dismiss", () => ({ backOrHome: mocks.back }));
vi.mock("convex/react", () => ({ useMutation: () => mocks.create }));
vi.mock("@convex-dev/react-query", () => ({ convexQuery: vi.fn() }));
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: [{ city: "Austin", count: 2 }] }),
}));
vi.mock("@/components/shared-list/name-sheet", () => ({
  NameSheet: vi.fn(() => null),
}));
vi.mock("@/components/symbol", () => ({ AppSymbolIcon: vi.fn(() => null) }));
vi.mock("@/components/trip-planner/chip", () => ({ Chip: vi.fn(() => null) }));
vi.mock("@/components/trip-planner/trip-planner-form", () => ({
  FormSection: vi.fn(({ children }: { children: ReactNode }) => (
    <section>{children}</section>
  )),
}));
vi.mock("@/components/ui/header-icon-button", () => ({
  HeaderIconButton: vi.fn(() => null),
}));
vi.mock("@/components/ui/themed-text", () => ({
  ThemedText: vi.fn(({ children }: { children: ReactNode }) => (
    <span>{children}</span>
  )),
}));
vi.mock("@/components/ui/button", () => ({
  Button: vi.fn(
    ({
      title,
      onPress,
      disabled,
    }: {
      title: string;
      onPress: () => void;
      disabled: boolean;
    }) => (
      <button type="button" onClick={onPress} disabled={disabled}>
        {title}
      </button>
    ),
  ),
}));
vi.mock("expo-router", () => {
  const toolbar = ({ children }: { children: ReactNode }) => children;
  const toolbarButton = ({
    children,
    onPress,
  }: {
    children: ReactNode;
    onPress: () => void;
  }) => (
    <button type="button" onClick={onPress}>
      {children}
    </button>
  );
  return {
    Stack: {
      Screen: vi.fn(() => null),
      Toolbar: Object.assign(toolbar, { Button: toolbarButton }),
    },
    useLocalSearchParams: () => ({ city: "Austin", from: "collections" }),
    useRouter: () => ({ replace: mocks.replace }),
  };
});

it("does not redirect or open sharing when a collection finishes after closing", async () => {
  const created = { listId: "my-list", inviteToken: "sample-token" };
  let finish: (value: typeof created) => void = () => {};
  mocks.create.mockReturnValue(
    new Promise<typeof created>((resolve) => {
      finish = resolve;
    }),
  );

  render(<NewSharedListScreen />);
  fireEvent.change(screen.getByRole("textbox", { name: "Name" }), {
    target: { value: "Weekend trip" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Create collection" }));
  await waitFor(() => expect(mocks.create).toHaveBeenCalledOnce());
  fireEvent.click(screen.getByRole("button", { name: "Close" }));
  expect(mocks.back).toHaveBeenCalledOnce();
  await act(async () => finish(created));
  expect(mocks.replace).not.toHaveBeenCalled();
  expect(mocks.shareInvite).not.toHaveBeenCalled();
});
