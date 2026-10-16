// @vitest-environment jsdom
import { render } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SpaceScreen from "@/app/(app)/space/[id]";

const mock = vi.hoisted(() => ({
  space: undefined as unknown,
  refused: false,
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
  useUnistyles: () => ({ theme: { gap: (n: number) => n * 8, colors: {} } }),
}));
vi.mock("expo-router", () => ({
  Stack: { Screen: vi.fn(() => null) },
  useRouter: () => ({ back: vi.fn(), push: vi.fn() }),
  useLocalSearchParams: () => ({ id: "x" }),
}));
vi.mock("expo-haptics", () => ({ notificationAsync: vi.fn() }));
vi.mock("@convex/_generated/api", () => ({
  api: { spaces: { getSpace: "space" } },
}));
vi.mock("@convex-dev/react-query", () => ({
  convexQuery: (ref: string) => ref,
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: mock.space, isError: mock.refused }),
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
  mock.refused = false;
});

describe("a link to a space id the server refuses", () => {
  it("shows the space as gone instead of loading forever", () => {
    mock.refused = true;

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
