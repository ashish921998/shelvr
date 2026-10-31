// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import EditSavePlacesScreen from "@/app/(app)/edit-save-places";

const mocks = vi.hoisted(() => ({
  save: vi.fn(),
  search: vi.fn(),
  back: vi.fn(),
  alert: vi.fn(),
  success: vi.fn(),
  data: {
    places: [{ name: "Old branch", city: "Lisbon", lat: 38.7, lng: -9.1 }],
    version: "original",
    ready: true,
  },
}));
vi.mock("@/lib/i18n", () => ({
  t: (key: string) => key,
  useAppLocale: () => "en",
}));
vi.mock("@/lib/analytics", () => ({ analytics: { captureError: vi.fn() } }));
vi.mock("@/lib/haptics", () => ({ haptics: { success: mocks.success } }));
vi.mock("@/lib/screen-dismiss", () => ({ backOrHome: () => mocks.back() }));
vi.mock("expo-router", () => ({
  Stack: { Screen: vi.fn(() => null) },
  useRouter: () => ({}),
  useLocalSearchParams: () => ({ itemId: "item" }),
}));
vi.mock("convex/react", () => ({
  useAction: () => mocks.search,
  useMutation: () => mocks.save,
}));
vi.mock("@convex-dev/react-query", () => ({ convexQuery: () => ({}) }));
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: mocks.data }),
}));
vi.mock("react-native-unistyles", () => ({
  StyleSheet: { create: () => ({}) },
}));
vi.mock("react-native", () => ({
  View: vi.fn(({ children }: { children: ReactNode }) => <div>{children}</div>),
  ScrollView: vi.fn(({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  )),
  Pressable: vi.fn(
    ({
      children,
      onPress,
      disabled,
    }: {
      children: ReactNode;
      onPress: () => void;
      disabled?: boolean;
    }) => (
      <button onClick={onPress} disabled={disabled}>
        {children}
      </button>
    ),
  ),
  TextInput: vi.fn(
    ({
      value,
      onChangeText,
      accessibilityLabel,
      editable,
    }: {
      value: string;
      onChangeText: (value: string) => void;
      accessibilityLabel: string;
      editable: boolean;
    }) => (
      <input
        aria-label={accessibilityLabel}
        value={value}
        onChange={(event) => onChangeText(event.target.value)}
        disabled={!editable}
      />
    ),
  ),
  Alert: { alert: mocks.alert },
  Keyboard: { dismiss: vi.fn() },
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
      loading,
    }: {
      title: string;
      onPress: () => void;
      disabled?: boolean;
      loading?: boolean;
    }) => (
      <button onClick={onPress} disabled={disabled || loading}>
        {title}
      </button>
    ),
  ),
}));
vi.mock("@/components/ui/screen-loader", () => ({
  ScreenLoader: vi.fn(() => null),
}));
vi.mock("@/components/empty-state", () => ({ EmptyState: vi.fn(() => null) }));
beforeEach(() => {
  vi.clearAllMocks();
  mocks.data = {
    places: [{ name: "Old branch", city: "Lisbon", lat: 38.7, lng: -9.1 }],
    version: "original",
    ready: true,
  };
  mocks.save.mockResolvedValue(null);
});
it("keeps the draft's version when another session changes the save", async () => {
  const view = render(<EditSavePlacesScreen />);
  fireEvent.click(screen.getByText("placeCorrection.remove"));
  mocks.data = { ...mocks.data, version: "newer" };
  view.rerender(<EditSavePlacesScreen />);
  fireEvent.click(screen.getByText("placeCorrection.save"));
  await waitFor(() =>
    expect(mocks.save).toHaveBeenCalledWith({
      itemId: "item",
      version: "original",
      places: [],
    }),
  );
});
it("replaces a branch with the chosen search result, without storing its display-only area", async () => {
  mocks.search.mockResolvedValue({
    available: true,
    places: [
      { name: "Correct branch", area: "Alfama", lat: 38.71, lng: -9.12 },
    ],
  });
  render(<EditSavePlacesScreen />);
  fireEvent.click(screen.getAllByText("placeCorrection.replace")[0]);
  fireEvent.click(
    screen.getByRole("button", { name: "placeCorrection.search" }),
  );
  await screen.findByText("Alfama, Lisbon");
  fireEvent.click(screen.getByText("Correct branch"));
  fireEvent.click(screen.getByText("placeCorrection.save"));
  await waitFor(() =>
    expect(mocks.save).toHaveBeenCalledWith({
      itemId: "item",
      version: "original",
      places: [
        { name: "Correct branch", city: "Lisbon", lat: 38.71, lng: -9.12 },
      ],
    }),
  );
});
it("confirms a correction once the server has saved it", async () => {
  render(<EditSavePlacesScreen />);
  fireEvent.click(screen.getByText("placeCorrection.save"));
  await waitFor(() => expect(mocks.back).toHaveBeenCalled());
  expect(mocks.success).toHaveBeenCalledOnce();
});
it("keeps the editor open when saving fails", async () => {
  mocks.save.mockRejectedValue(new Error("stale"));
  render(<EditSavePlacesScreen />);
  fireEvent.click(screen.getByText("placeCorrection.save"));
  await waitFor(() => expect(mocks.alert).toHaveBeenCalled());
  expect(mocks.back).not.toHaveBeenCalled();
  expect(mocks.success).not.toHaveBeenCalled();
});
