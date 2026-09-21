// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import type { ComponentProps, ReactNode } from "react";
import { ArticleReaderView } from "./article-reader-view";

vi.mock("@/lib/i18n", () => ({
  t: (key: string) => key,
  useAppLocale: vi.fn(),
  formattingLocale: () => "en-US",
}));
vi.mock("react-native", () => ({
  View: vi.fn(({ children }: { children: ReactNode }) => <div>{children}</div>),
  ScrollView: vi.fn(({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  )),
  Text: vi.fn(({ children }: { children: ReactNode }) => (
    <span>{children}</span>
  )),
  Pressable: vi.fn(
    ({
      children,
      onPress,
      accessibilityState,
    }: {
      children: ReactNode;
      onPress: () => void;
      accessibilityState?: { expanded: boolean };
    }) => (
      <button onClick={onPress} aria-expanded={accessibilityState?.expanded}>
        {children}
      </button>
    ),
  ),
  ActivityIndicator: vi.fn(() => null),
  useWindowDimensions: () => ({ width: 390, height: 844 }),
}));
vi.mock("react-native-unistyles", () => ({
  StyleSheet: { create: () => ({}) },
  useUnistyles: () => ({ theme: { colors: {}, gap: (n: number) => n * 8 } }),
}));
vi.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0 }),
}));
vi.mock("expo-image", () => ({ Image: vi.fn(() => null) }));
vi.mock("expo-router", () => ({
  Link: {
    AppleZoomTarget: vi.fn(({ children }: { children: ReactNode }) => children),
  },
}));
vi.mock("@/components/symbol", () => ({ AppSymbolIcon: vi.fn(() => null) }));
vi.mock("@/components/tag-chip", () => ({
  TagChip: vi.fn(({ label }: { label: string }) => (
    <span data-testid="tag">{label}</span>
  )),
}));
vi.mock("@/components/products-section", () => ({
  ProductsSection: vi.fn(() => null),
}));
vi.mock("@/components/recipe-section", () => ({
  RecipeSection: vi.fn(() => null),
}));
vi.mock("@/components/item-spaces", () => ({ ItemSpaces: vi.fn(() => null) }));
vi.mock("@/components/post-media-button", () => ({
  PostMediaButton: vi.fn(() => null),
}));
vi.mock("@/components/similar-grid", () => ({
  SimilarGrid: vi.fn(() => null),
}));
vi.mock("@/components/item-source-link", () => ({
  ItemSourceLink: vi.fn(() => null),
  openItemSource: vi.fn(),
}));

it("collapses tags on a recycled item but preserves expansion on the same item", () => {
  type Props = ComponentProps<typeof ArticleReaderView>;
  const item = {
    _id: "article-a",
    type: "link",
    status: "ready",
    url: "https://example.com",
    tags: ["first", "second", "third"],
  } as Props["item"];
  const props = {
    item,
    isZoomTarget: false,
    headerHeight: 0,
    spaces: [],
    similar: undefined,
    heroUri: undefined,
    paragraphs: ["Test article"],
  };
  const { rerender } = render(<ArticleReaderView {...props} />);
  fireEvent.click(screen.getByRole("button", { expanded: false }));
  expect(screen.getAllByTestId("tag")).toHaveLength(3);
  rerender(
    <ArticleReaderView
      {...props}
      item={{ ...item, description: "Refreshed" }}
    />,
  );
  expect(screen.getByRole("button", { expanded: true })).toBeTruthy();
  rerender(
    <ArticleReaderView
      {...props}
      item={{
        ...item,
        _id: "article-b" as Props["item"]["_id"],
        tags: ["new"],
      }}
    />,
  );
  expect(screen.getByRole("button", { expanded: false })).toBeTruthy();
  expect(screen.queryAllByTestId("tag")).toHaveLength(0);
});
