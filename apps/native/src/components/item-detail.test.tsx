// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ItemDetail, type DetailItem } from "./item-detail";
import { ItemSourceLink, openItemSource } from "@/components/item-source-link";
import { PostMediaButton } from "@/components/post-media-button";
import { Link } from "expo-router";
import { Image } from "expo-image";
import { AppSymbolIcon } from "@/components/symbol";
import { saveError } from "@convex/model/saveErrors";
import { Alert } from "react-native";

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
const fullRow = vi.hoisted(() => ({ loading: false }));
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: undefined, isError: !fullRow.loading }),
}));
const retry = vi.hoisted(() => ({ reprocess: vi.fn(), guard: vi.fn() }));
vi.mock("convex/react", () => ({ useMutation: () => retry.reprocess }));
vi.mock("@/lib/entitlement", () => ({
  usePaywallGuard: () => ({ guard: retry.guard, loading: false }),
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
  imageUrl: "https://happy-otter-123.convex.cloud/api/storage/0b1c2d3e",
  heroImageUrl: "https://happy-otter-123.convex.cloud/api/storage/0b1c2d3e",
  aspectRatio: 4 / 3,
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
  fullRow.loading = false;
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
    expect(Link.AppleZoomTarget).toHaveBeenCalled();
  });

  it("shows the link mark for a host with no letter to take", () => {
    renderPage({ ...product, url: "https://bücher.de/" }, true);
    expect(screen.getByText("xn--bcher-kva.de")).toBeTruthy();
    expect(
      vi
        .mocked(AppSymbolIcon)
        .mock.calls.some(([props]) => props.name === "link"),
    ).toBe(true);
    expect(Link.AppleZoomTarget).toHaveBeenCalled();
  });

  it("has the panel up for the card's zoom while the body still loads", () => {
    fullRow.loading = true;
    renderPage(product, true);
    expect(screen.getByText("I")).toBeTruthy();
    expect(Link.AppleZoomTarget).toHaveBeenCalled();
  });

  it("waits for the body before showing a link that may be an article", () => {
    fullRow.loading = true;
    renderPage({ ...product, enrichment: undefined }, true);
    expect(screen.queryByText("I")).toBeNull();
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
    expect(screen.queryByText("Y")).toBeNull();
  });

  it("crops the black bars off YouTube's 4:3 thumbnail", () => {
    renderPage(video);
    const hero = vi.mocked(Image).mock.calls[0][0] as {
      contentFit: string;
      style: { width: number; height: number }[];
    };
    expect(hero.contentFit).toBe("cover");
    const { width, height } = hero.style[1];
    expect(width / height).toBeCloseTo(16 / 9);
  });

  it("leaves a YouTube Short's thumbnail at its own shape", () => {
    renderPage({ ...video, url: "https://www.youtube.com/shorts/abc123" });
    const hero = vi.mocked(Image).mock.calls[0][0] as {
      contentFit: string;
      style: { width: number; height: number }[];
    };
    expect(hero.contentFit).toBe("contain");
    const { width, height } = hero.style[1];
    expect(width / height).toBeCloseTo(4 / 3);
  });

  it("only plays a YouTube link that is a video", () => {
    renderPage({ ...video, url: "https://www.youtube.com/@RickAstleyYT" });
    expect(PostMediaButton).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "item.viewOnSite:YouTube" }),
    ).toBeTruthy();
  });

  it("retries without the paywall when the server allows it, as for the free demo save", async () => {
    retry.reprocess.mockReset().mockResolvedValue(true);
    retry.guard.mockReset();
    renderPage({ ...product, status: "failed", failureReason: "error" });
    fireEvent.click(screen.getByText("common.tryAgain"));
    await waitFor(() =>
      expect(retry.reprocess).toHaveBeenCalledWith({ id: "item-1" }),
    );
    expect(retry.guard).not.toHaveBeenCalled();
  });

  it("opens the paywall only when the server asks for Pro", async () => {
    retry.reprocess.mockReset().mockRejectedValue(saveError("pro_required"));
    retry.guard.mockReset();
    renderPage({ ...product, status: "failed", failureReason: "error" });
    fireEvent.click(screen.getByText("common.tryAgain"));
    await waitFor(() => expect(retry.guard).toHaveBeenCalledOnce());
  });

  it("says the retry failed when the server wants Pro this device still shows", async () => {
    retry.reprocess.mockReset().mockRejectedValue(saveError("pro_required"));
    retry.guard.mockReset().mockResolvedValue(true);
    vi.mocked(Alert.alert).mockClear();
    renderPage({ ...product, status: "failed", failureReason: "error" });
    fireEvent.click(screen.getByText("common.tryAgain"));
    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith(
        "errors.retryTitle",
        "errors.retrySoon",
      ),
    );
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
