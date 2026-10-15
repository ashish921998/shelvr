// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { expect, it, vi } from "vitest";
import type { Id } from "@convex/_generated/dataModel";
import { ItemSpaces } from "./item-spaces";

const router = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("expo-router", () => ({ useRouter: () => router }));
vi.mock("@/lib/i18n", () => ({
  t: (key: string, params?: { spaces?: string }) =>
    params?.spaces ? `${key}:${params.spaces}` : key,
  useAppLocale: vi.fn(),
}));
vi.mock("react-native", () => ({
  Text: vi.fn(({ children }: { children: ReactNode }) => (
    <span>{children}</span>
  )),
  Pressable: vi.fn(
    ({ children, onPress }: { children: ReactNode; onPress: () => void }) => (
      <button onClick={onPress}>{children}</button>
    ),
  ),
}));
vi.mock("react-native-unistyles", () => ({
  StyleSheet: { create: () => ({}) },
  useUnistyles: () => ({
    theme: { colors: {}, control: { pressRetentionOffset: 12 } },
  }),
}));
vi.mock("@/components/symbol", () => ({ AppSymbolIcon: vi.fn(() => null) }));

const itemId = "item-1" as Id<"items">;

it("shows nothing for a save in no space", () => {
  const { container } = render(<ItemSpaces itemId={itemId} spaces={[]} />);
  expect(container.firstChild).toBeNull();
});

it("names the save's spaces and opens the space picker when tapped", () => {
  render(
    <ItemSpaces
      itemId={itemId}
      spaces={[
        { _id: "s1" as Id<"spaces">, name: "Recipes" },
        { _id: "s2" as Id<"spaces">, name: "Travel" },
      ]}
    />,
  );
  fireEvent.click(screen.getByRole("button"));
  expect(screen.getByText("item.inSpaces:Recipes, Travel")).toBeTruthy();
  expect(router.push).toHaveBeenCalledWith({
    pathname: "/manage-spaces",
    params: { itemId },
  });
});
