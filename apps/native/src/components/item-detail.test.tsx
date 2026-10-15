// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ItemDetail, type DetailItem } from "./item-detail";
import { ItemSourceLink, openItemSource } from "@/components/item-source-link";
import { PostMediaButton } from "@/components/post-media-button";
import { Link } from "expo-router";

vi.mock("@/lib/i18n", () => ({
  t: (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${Object.values(values).join(",")}` : key,
  useAppLocale: vi.fn(),
}));
vi.mock("react-native", () => ({
  View: vi.fn(({ children }: { children?: ReactNode }) => (
    <div>{children}</div>
  )),
  ScrollView: vi.fn(({ children }: { children?: ReactNode }) => (
    <div>{children}</div>
  )),
  Text: vi.fn(({ children }: { children?: ReactNode }) => (
    <span>{children}</span>
  )),
  Pressable: vi.fn(
    ({ children, onPress }: { children?: ReactNode; onPress?: () => void }) => (
      <button onClick={onPress}>{children}</button>
    ),
  ),
  Alert: { alert: vi.fn() },
  Platform: { OS: "ios" },
  useWindowDimensions: () => ({ width: 390, height: 844 }),
}));
vi.mock("react-native-unistyles", () => ({
  StyleSheet: { create: () => ({}) },
  useUnistyles: () => ({
    theme: { colors: {}, gap: (n: number) => n * 8 },
  }),
}));
vi.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0 }),
}));
vi.mock("expo-image", () => ({
  Image: vi.fn(() => <img data-testid="hero" alt="" />),
}));
vi.mock("expo-router", () => ({
  Link: {
    AppleZoomTarget: vi.fn(({ children }: { children: ReactNode }) => children),
  },
}));
vi.mock("@convex/_generated/api", () => ({
  api: {
    items: {
      getItem: "getItem",
      similarItems: "similarItems",
      reprocessItem: "reprocessItem",
    },
  },
}));
vi.mock("@convex-dev/react-query", () => ({
  convexQuery: (query: string, args: unknown) => ({ queryKey: [query, args] }),
}));
// getItem has failed, so the page paints the row it was handed at once.
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: undefined, isError: true }),
}));
vi.mock("convex/react", () => ({ useMutation: () => vi.fn() }));
vi.mock("@/lib/entitlement", () => ({
  usePaywallGuard: () => ({ guard: vi.fn(), loading: false }),
}));
vi.mock("@/lib/header-layout", () => ({ useAppHeaderHeight: () => 0 }));
vi.mock("@/lib/intents", () => ({ runIntent: vi.fn() }));
vi.mock("@/lib/analytics", () => ({ analytics: { itemAction: vi.fn() } }));
vi.mock("@/components/ui/stitch-loader", () => ({
  StitchRing: vi.fn(() => null),
}));
vi.mock("@/components/ui/button", () => ({
  Button: vi.fn(
    ({ title, onPress }: { title: string; onPress: () => void }) => (
      <button onClick={onPress}>{title}</button>
    ),
  ),
}));
vi.mock("@/components/symbol", () => ({ AppSymbolIcon: vi.fn(() => null) }));
vi.mock("@/components/post-media-button", () => ({
  PostMediaButton: vi.fn(({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  )),
}));
vi.mock("@/components/item-source-link", () => ({
  ItemSourceLink: vi.fn(() => null),
  openItemSource: vi.fn(),
}));
vi.mock("@/components/article-reader-view", () => ({
  ArticleReaderView: vi.fn(() => null),
}));
vi.mock("@/components/media-viewer-page", () => ({
  MediaViewerPage: vi.fn(() => null),
}));
vi.mock("@/components/item-spaces", () => ({ ItemSpaces: vi.fn(() => null) }));
vi.mock("@/components/note-editor", () => ({ NoteEditor: vi.fn(() => null) }));
vi.mock("@/components/intent-chip", () => ({ IntentChip: vi.fn(() => null) }));
vi.mock("@/components/tag-chip", () => ({ TagChip: vi.fn(() => null) }));
vi.mock("@/components/products-section", () => ({
  ProductsSection: vi.fn(() => null),
}));
vi.mock("@/components/recipe-section", () => ({
  RecipeSection: vi.fn(() => null),
}));
vi.mock("@/components/similar-grid", () => ({
  SimilarGrid: vi.fn(() => null),
}));

const product = {
  _id: "item-1",
  _creationTime: 0,
  type: "link",
  status: "ready",
  enrichment: "no_article",
  title: "Poäng armchair",
  description: "A bent birch armchair.",
  url: "https://www.ikea.com/us/en/p/poang-armchair-50240603/",
  siteName: "IKEA",
  tags: [],
} as unknown as DetailItem;

const video = {
  ...product,
  title: "Never Gonna Give You Up",
  url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  siteName: "YouTube",
  imageUrl: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
  aspectRatio: 16 / 9,
} as DetailItem;

function renderPage(item: DetailItem, isZoomTarget = false) {
  return render(
    <ItemDetail
      item={item}
      isZoomTarget={isZoomTarget}
      pageHeight={844}
      reserveFooter={false}
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("a plain link's page", () => {
  it("leads with one button to the site, not an error or the raw address", () => {
    renderPage(product);
    fireEvent.click(
      screen.getByRole("button", { name: "item.viewOnSite:IKEA" }),
    );
    expect(openItemSource).toHaveBeenCalledWith(product);
    expect(screen.queryByText("item.noArticle")).toBeNull();
    expect(screen.queryByText(product.url!)).toBeNull();
    expect(ItemSourceLink).not.toHaveBeenCalled();
  });

  it("shows the site's letter where a picture would be", () => {
    renderPage(product, true);
    expect(screen.getByText("I")).toBeTruthy();
    expect(screen.getByText("ikea.com")).toBeTruthy();
    // The card's zoom lands on the panel, as it would on a photo.
    expect(Link.AppleZoomTarget).toHaveBeenCalled();
  });

  it("names a site with no name by its host", () => {
    renderPage({ ...product, siteName: undefined });
    expect(
      screen.getByRole("button", { name: "item.viewOnSite:ikea.com" }),
    ).toBeTruthy();
  });

  it("plays a YouTube thumbnail on YouTube and asks to watch there", () => {
    renderPage(video);
    expect(vi.mocked(PostMediaButton).mock.calls[0][0]).toMatchObject({
      site: "YouTube",
      playable: true,
    });
    expect(
      screen.getByRole("button", { name: "item.watchOnSite:YouTube" }),
    ).toBeTruthy();
    // The photo is the hero, so there is no letter panel.
    expect(screen.queryByText("Y")).toBeNull();
  });

  it("keeps the retry for a page that read only partly", () => {
    renderPage({ ...product, enrichment: "partial" });
    expect(screen.getByText("item.partial")).toBeTruthy();
    expect(screen.getByText("common.tryAgain")).toBeTruthy();
  });
});

it("keeps a post's source line instead of the site button", () => {
  renderPage({
    ...product,
    url: "https://www.tiktok.com/@cook/video/7300000000000000000",
    siteName: "TikTok",
  });
  expect(ItemSourceLink).toHaveBeenCalled();
  expect(screen.queryByText(/item\.(view|watch)OnSite/)).toBeNull();
});
