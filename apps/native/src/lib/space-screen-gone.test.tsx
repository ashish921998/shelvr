// @vitest-environment jsdom
import { render } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SpaceScreen from "@/app/(app)/space/[id]";

const mock = vi.hoisted(() => ({
  space: undefined as unknown,
  error: null as unknown,
  emptyState: vi.fn(() => null),
  screenLoader: vi.fn(() => null),
}));

function Container({ children }: { children?: ReactNode }) {
  return <div>{children}</div>;
}

vi.mock("react-native", () => ({
  View: Container,
  Text: Container,
  Pressable: Container,
  Platform: { OS: "ios" },
  Alert: { alert: vi.fn() },
}));
vi.mock("react-native-reanimated", () => ({
  default: { View: Container },
  FadeIn: {},
  FadeOut: {},
}));
vi.mock("react-native-unistyles", () => ({
  StyleSheet: { create: () => ({}) },
  useUnistyles: () => ({
    theme: { gap: (n: number) => n * 8, colors: {}, fonts: {} },
  }),
}));
vi.mock("expo-router", () => {
  const Toolbar = Object.assign(Container, {
    Button: Container,
    Menu: Container,
    MenuAction: Container,
  });
  return {
    Stack: { Screen: vi.fn(() => null), Title: Container, Toolbar },
    useRouter: () => ({ back: vi.fn(), push: vi.fn() }),
    useLocalSearchParams: () => ({ id: "x" }),
  };
});
vi.mock("expo-haptics", () => ({ notificationAsync: vi.fn() }));
vi.mock("@convex/_generated/api", () => ({
  api: { spaces: { getSpace: "space" } },
}));
vi.mock("@convex-dev/react-query", () => ({
  convexQuery: (ref: string) => ref,
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: mock.space, error: mock.error }),
}));
vi.mock("convex/react", () => ({ useMutation: () => vi.fn() }));
vi.mock("@/lib/i18n", () => ({
  t: (key: string) => key,
  useAppLocale: vi.fn(),
}));
vi.mock("@/lib/analytics", () => ({ analytics: { capture: vi.fn() } }));
vi.mock("@/lib/entitlement", () => ({
  usePaywallGuard: () => ({ guard: vi.fn() }),
}));
vi.mock("@/lib/make-plan", () => ({ canMakePlan: () => false }));
vi.mock("@/components/empty-state", () => ({ EmptyState: mock.emptyState }));
vi.mock("@/components/ui/screen-loader", () => ({
  ScreenLoader: mock.screenLoader,
}));
vi.mock("@/components/ui/header-icon-button", () => ({
  HeaderActionMenu: vi.fn(() => null),
  HeaderIconButton: vi.fn(() => null),
}));
vi.mock("@/components/ui/header-scrim", () => ({
  HeaderScrim: vi.fn(() => null),
}));
vi.mock("@/components/masonry-feed", () => ({
  MasonryFeed: vi.fn(() => null),
}));
vi.mock("@/components/symbol", () => ({ AppSymbolIcon: vi.fn(() => null) }));

beforeEach(() => {
  vi.clearAllMocks();
  mock.space = undefined;
  mock.error = null;
});

describe("a link to a space id the server refuses", () => {
  it("shows the space as gone instead of loading forever", () => {
    mock.error = new Error("ArgumentValidationError");

    render(<SpaceScreen />);

    expect(mock.screenLoader).not.toHaveBeenCalled();
    expect(mock.emptyState).toHaveBeenCalledWith(
      expect.objectContaining({ message: "spaces.gone" }),
      undefined,
    );
  });

  it("keeps a loaded space up through a later query error", () => {
    mock.space = { _id: "s1", name: "Trips", suggestions: [], items: [] };
    mock.error = new Error("Server Error");

    render(<SpaceScreen />);

    expect(mock.emptyState).not.toHaveBeenCalled();
    expect(mock.screenLoader).not.toHaveBeenCalled();
  });

  it("keeps loading through an auth error the query will recover from", () => {
    mock.error = new Error("Not authenticated");

    render(<SpaceScreen />);

    expect(mock.screenLoader).toHaveBeenCalled();
    expect(mock.emptyState).not.toHaveBeenCalled();
  });

  it("shows a space the server answers null for as gone", () => {
    mock.space = null;

    render(<SpaceScreen />);

    expect(mock.screenLoader).not.toHaveBeenCalled();
    expect(mock.emptyState).toHaveBeenCalledWith(
      expect.objectContaining({ message: "spaces.gone" }),
      undefined,
    );
  });

  it("still loads while the query has no answer", () => {
    render(<SpaceScreen />);

    expect(mock.screenLoader).toHaveBeenCalled();
    expect(mock.emptyState).not.toHaveBeenCalled();
  });
});
