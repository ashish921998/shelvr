// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { cloneElement, isValidElement, type ReactNode } from "react";
import { Alert, Pressable, View } from "react-native";
import { MenuView } from "@expo/ui/community/menu";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Image } from "expo-image";
import { analytics } from "@/lib/analytics";
import { runIntent } from "@/lib/intents";
import { ItemCard, type FeedItem } from "./item-card";
import { textFaceCopy } from "./item-card-face";

type A11yProps = {
  children?: ReactNode;
  accessible?: boolean;
  role?: string;
  accessibilityRole?: string;
  accessibilityLabel?: string;
};
vi.mock("@/components/ui/stitch-loader", () => ({
  StitchRing: vi.fn(() => null),
  StitchRow: vi.fn(() => null),
}));
vi.mock("react-native", () => {
  const a11yElement = ({
    children,
    accessible,
    role,
    accessibilityRole,
    accessibilityLabel,
  }: A11yProps) => (
    <div role={role ?? accessibilityRole} aria-label={accessibilityLabel}>
      {accessible ? <div aria-hidden>{children}</div> : children}
    </div>
  );
  return {
    View: vi.fn(a11yElement),
    Pressable: vi.fn(
      ({
        children,
        ...props
      }: Omit<A11yProps, "children"> & {
        children?: ReactNode | ((state: { pressed: boolean }) => ReactNode);
      }) =>
        a11yElement({
          ...props,
          children:
            typeof children === "function"
              ? children({ pressed: false })
              : children,
        }),
    ),
    Text: vi.fn(({ children }: { children?: ReactNode }) => (
      <span>{children}</span>
    )),
    Alert: { alert: vi.fn() },
    AppState: { addEventListener: vi.fn() },
    Platform: { OS: "ios" },
    Share: { share: vi.fn(), sharedAction: "sharedAction" },
    StyleSheet: { flatten: (style: unknown) => style },
  };
});

const routerPush = vi.hoisted(() => vi.fn());
const motionPreference = vi.hoisted(() => ({ reduced: true }));
const linkProps = vi.hoisted(() => vi.fn());
const triggerProps = vi.hoisted(() => vi.fn());
const zoomTargets = vi.hoisted(() => vi.fn());
vi.mock("expo-router", () => {
  const Link = (props: { children?: ReactNode }) => {
    linkProps(props);
    return <>{props.children}</>;
  };
  Link.Trigger = (props: { children?: ReactNode; withAppleZoom?: boolean }) => {
    triggerProps(props);
    const { children } = props;
    return isValidElement<A11yProps>(children)
      ? cloneElement(children, { role: "link", ...children.props })
      : children;
  };
  Link.Preview = function LinkPreview() {
    return null;
  };
  Link.AppleZoomTarget = function LinkAppleZoomTarget({
    children,
  }: {
    children?: ReactNode;
  }) {
    zoomTargets(children);
    return <div aria-hidden>{children}</div>;
  };
  Link.Menu = function LinkMenu({ children }: { children?: ReactNode }) {
    return <ul data-testid="link-menu">{children}</ul>;
  };
  Link.MenuAction = function LinkMenuAction({ title }: { title: string }) {
    return <li>{title}</li>;
  };
  return { Link, useRouter: () => ({ push: routerPush }) };
});

vi.mock("react-native-reanimated", async () => {
  const { View } = await import("react-native");
  return {
    default: { View },
    ZoomOut: {
      springify: () => ({ damping: () => ({ stiffness: () => ({}) }) }),
    },
    useReducedMotion: () => motionPreference.reduced,
  };
});
vi.mock("@/lib/motion", () => ({
  motion: {
    duration: { feedback: 120, state: 180, enter: 250, exit: 200 },
    easing: { out: {} },
    scale: { pressed: 0.97, enter: 0.95 },
  },
  REDUCED_FADE_IN: {},
  REDUCED_FADE_OUT: {},
}));
vi.mock("react-native-unistyles", () => ({
  StyleSheet: { create: () => ({ cell: { padding: 4 } }) },
  useUnistyles: () => ({
    theme: {
      colors: {
        faint: "gray",
        foreground: "black",
        danger: "red",
        primary: "orange",
      },
    },
  }),
}));
vi.mock("expo-image", () => ({ Image: vi.fn(() => null) }));
vi.mock("expo-crypto", () => ({
  CryptoDigestAlgorithm: { SHA256: "SHA-256" },
  digestStringAsync: vi.fn(async () => "0123456789abcdef0123"),
}));
vi.mock("expo-haptics", () => ({
  notificationAsync: vi.fn(),
  NotificationFeedbackType: { Success: "success" },
}));
const mutate = vi.hoisted(() => vi.fn(async () => null));
vi.mock("convex/react", () => ({ useMutation: () => mutate }));
vi.mock("@/lib/share/share-store", () => ({
  forgetDeletedSharedItem: vi.fn(),
}));
vi.mock("@/lib/analytics", () => ({
  analytics: {
    capture: vi.fn(),
    captureError: vi.fn(),
    itemAction: vi.fn(),
    itemDeleted: vi.fn(),
  },
}));
vi.mock("@/components/symbol", () => ({ AppSymbolIcon: vi.fn(() => null) }));
vi.mock("@/lib/intents", () => ({ runIntent: vi.fn(async () => undefined) }));
vi.mock("@/components/intent-chip", () => ({
  IntentChip: vi.fn(
    ({ label, onPress }: { label: string; onPress: () => void }) => (
      <button onClick={onPress}>{label}</button>
    ),
  ),
}));
vi.mock("@/components/glass", () => ({
  GlassView: vi.fn(({ children }: { children?: ReactNode }) => (
    <div>{children}</div>
  )),
}));
vi.mock("@expo/ui/community/menu", () => ({
  MenuView: vi.fn(({ children }: { children?: ReactNode }) => (
    <div>{children}</div>
  )),
}));

const base: FeedItem = {
  _id: "item-1" as FeedItem["_id"],
  type: "link",
  status: "ready",
  tags: [],
};
function labelledProps(owner: typeof View | typeof Pressable, name: string) {
  const call = vi
    .mocked(owner)
    .mock.calls.findLast(([props]) => props.accessibilityLabel === name);
  if (!call) throw new Error(`no card labelled ${name}`);
  return call[0];
}

describe.each([false, true])("with reduced motion %s", (reduced) => {
  const os = process.env.EXPO_OS;
  afterEach(() => {
    process.env.EXPO_OS = os;
    motionPreference.reduced = true;
  });

  it.each(["ios", "android"])(
    "keeps the %s shell immediate and navigation current when a cell is rebound",
    (platform) => {
      process.env.EXPO_OS = platform;
      motionPreference.reduced = reduced;
      vi.mocked(View).mockClear();
      const { rerender } = render(
        <ItemCard
          item={{ ...base, title: "First save" }}
          source={{ from: "home" }}
        />,
      );
      const assertShell = () => {
        const shell = vi.mocked(View).mock.calls[0][0];
        expect(shell).not.toHaveProperty("entering", expect.anything());
        expect(shell).not.toHaveProperty("exiting", expect.anything());
        expect(shell).not.toHaveProperty("layout", expect.anything());
        expect(shell.style).toEqual({ padding: 4 });
        expect(triggerProps).toHaveBeenLastCalledWith(
          expect.objectContaining({ withAppleZoom: !reduced }),
        );
      };
      assertShell();
      vi.mocked(View).mockClear();
      rerender(
        <ItemCard
          item={{
            ...base,
            _id: "item-2" as FeedItem["_id"],
            title: "Second save",
            fixtureKey: "second",
          }}
          source={{ from: "search", q: "Second" }}
        />,
      );
      assertShell();
      expect(
        screen.getAllByRole("button", { name: "Second save" }),
      ).toHaveLength(1);
      expect(screen.queryByRole("button", { name: "First save" })).toBeNull();
      const href = {
        pathname: "/item/[id]",
        params: { id: "item-2", from: "search", q: "Second" },
      };
      expect(linkProps).toHaveBeenLastCalledWith(
        expect.objectContaining({ href, asChild: true }),
      );
      const owner = platform === "ios" ? View : Pressable;
      expect(labelledProps(owner, "Second save").accessibilityLabel).toBe(
        "Second save",
      );
      vi.mocked(View).mockClear();
      rerender(
        <ItemCard
          item={{ ...base, title: "Space save", suggested: true }}
          source={{ from: "space", spaceId: "space-1" }}
        />,
      );
      assertShell();
      expect(linkProps).toHaveBeenLastCalledWith(
        expect.objectContaining({
          href: {
            pathname: "/item/[id]",
            params: { id: "item-1", from: "space", spaceId: "space-1" },
          },
        }),
      );
    },
  );
});
function card(item: Partial<FeedItem>, name: string) {
  render(<ItemCard item={{ ...base, ...item }} />);
  return screen.getByRole("button", { name });
}

it("skips re-rendering when the feed passes an equal source in a new object", () => {
  const item = { ...base, title: "Miso soup recipe" };
  const menuRenders = () => vi.mocked(MenuView).mock.calls.length;
  const { rerender } = render(
    <ItemCard item={item} source={{ from: "home" }} />,
  );
  const first = menuRenders();

  rerender(<ItemCard item={item} source={{ from: "home" }} />);
  expect(menuRenders()).toBe(first);

  rerender(<ItemCard item={item} source={{ from: "search", q: "miso" }} />);
  expect(menuRenders()).toBeGreaterThan(first);

  const searched = menuRenders();
  rerender(<ItemCard item={item} source={{ from: "search", q: "soup" }} />);
  expect(menuRenders()).toBeGreaterThan(searched);
});

it("reads a card out by its title", () => {
  expect(card({ title: "Miso soup recipe" }, "Miso soup recipe")).toBeTruthy();
});

it.each([undefined, "", "   ", "\n\t"])(
  "skips a %j title for the next thing that names the card",
  (title) => {
    expect(
      card({ title, note: "Weeknight dinners" }, "Weeknight dinners"),
    ).toBeTruthy();
    expect(
      card(
        { title, url: "https://www.seriouseats.com/miso" },
        "seriouseats.com",
      ),
    ).toBeTruthy();
  },
);

it("says a card is still processing when nothing else names it", () => {
  expect(
    card({ status: "processing", title: "  " }, "Still working on it"),
  ).toBeTruthy();
});

it("names a failed card by what went wrong rather than calling it untitled", () => {
  expect(
    card(
      { status: "failed", failureReason: "not_found", title: "" },
      "Page not found",
    ),
  ).toBeTruthy();
});

it("calls a ready card with no title, note or link untitled", () => {
  expect(card({ type: "image", title: "   " }, "Untitled item")).toBeTruthy();
});

it("stays a button even though Link marks the trigger a link", () => {
  card({ title: "Miso soup recipe" }, "Miso soup recipe");
  expect(screen.queryByRole("link")).toBeNull();
});

it("still renders the save-actions control and the long-press menu", () => {
  render(
    <ItemCard
      item={{ ...base, title: "Miso soup recipe", url: "https://example.com" }}
    />,
  );
  expect(
    screen.getByRole("button", { name: "Save actions", hidden: true }),
  ).toBeTruthy();
  const menu = screen.getByTestId("link-menu").textContent;
  expect(menu).toContain("Share");
  expect(menu).toContain("Change spaces");
  expect(menu).toContain("Delete");
});

it("offers Dismiss in the suggested save's long-press menu", () => {
  render(
    <ItemCard
      item={{ ...base, suggested: true }}
      source={{ from: "space", spaceId: "space-1" }}
    />,
  );
  expect(screen.getByTestId("link-menu").textContent).toContain("Dismiss");
});

describe("on iOS", () => {
  const os = process.env.EXPO_OS;
  afterEach(() => {
    process.env.EXPO_OS = os;
  });

  function renderOnIos(item: Partial<FeedItem>) {
    process.env.EXPO_OS = "ios";
    vi.mocked(View).mockClear();
    render(<ItemCard item={{ ...base, ...item }} />);
  }

  it("reads the card from the cell, as one button, with its fixture id", () => {
    renderOnIos({ title: "Miso soup recipe", fixtureKey: "ramen" });
    expect(
      screen.getAllByRole("button", { name: "Miso soup recipe" }),
    ).toHaveLength(1);
    expect(screen.queryByRole("link")).toBeNull();
    const props = labelledProps(View, "Miso soup recipe");
    expect(props.accessible).toBe(true);
    expect(props.testID).toBe("fixture-item-ramen");
  });

  it("opens the save when VoiceOver activates the card", () => {
    renderOnIos({ title: "Miso soup recipe" });
    routerPush.mockClear();
    labelledProps(View, "Miso soup recipe").onAccessibilityTap?.();
    expect(routerPush).toHaveBeenCalledWith({
      pathname: "/item/[id]",
      params: { id: "item-1" },
    });
  });

  it("stays readable as the zoom landing target", () => {
    process.env.EXPO_OS = "ios";
    zoomTargets.mockClear();
    render(
      <ItemCard item={{ ...base, title: "Miso soup recipe" }} zoomTarget />,
    );
    const [target] = zoomTargets.mock.lastCall ?? [];
    expect(isValidElement(target) && target.type).toBe(View);
    expect(
      isValidElement<{ collapsable?: boolean }>(target) &&
        target.props.collapsable,
    ).toBe(false);
    expect(
      screen.getAllByRole("button", { name: "Miso soup recipe" }),
    ).toHaveLength(1);
  });

  it("offers the card's menu actions to the screen reader", () => {
    renderOnIos({ title: "Miso soup recipe", url: "https://example.com" });
    const props = labelledProps(View, "Miso soup recipe");
    expect(props.accessibilityActions?.map(({ label }) => label)).toEqual([
      "Share",
      "Change spaces",
      "Delete",
    ]);
  });
});

it("runs a menu action picked from the screen reader's actions", () => {
  vi.mocked(View).mockClear();
  render(<ItemCard item={{ ...base, title: "Miso soup recipe" }} />);
  labelledProps(Pressable, "Miso soup recipe").onAccessibilityAction?.({
    nativeEvent: { actionName: "Delete" },
  } as never);
  expect(Alert.alert).toHaveBeenCalledWith(
    "Delete this save?",
    expect.any(String),
    expect.any(Array),
  );
});

it("reports a confirmed delete from the feed", async () => {
  vi.mocked(Alert.alert).mockClear();
  render(
    <ItemCard
      item={{ ...base, _creationTime: 1000, title: "Miso soup recipe" }}
    />,
  );
  labelledProps(Pressable, "Miso soup recipe").onAccessibilityAction?.({
    nativeEvent: { actionName: "Delete" },
  } as never);
  const buttons = vi.mocked(Alert.alert).mock.calls[0]?.[2] ?? [];
  buttons.find((button) => button.style === "destructive")?.onPress?.();
  await waitFor(() =>
    expect(analytics.itemDeleted).toHaveBeenCalledWith(
      expect.objectContaining({ _id: "item-1", _creationTime: 1000 }),
      "feed",
    ),
  );
});

it("says so when a confirmed delete fails", async () => {
  vi.mocked(Alert.alert).mockClear();
  vi.mocked(analytics.itemDeleted).mockClear();
  mutate.mockRejectedValueOnce(new Error("offline"));
  render(<ItemCard item={{ ...base, title: "Miso soup recipe" }} />);
  labelledProps(Pressable, "Miso soup recipe").onAccessibilityAction?.({
    nativeEvent: { actionName: "Delete" },
  } as never);
  const buttons = vi.mocked(Alert.alert).mock.calls[0]?.[2] ?? [];
  buttons.find((button) => button.style === "destructive")?.onPress?.();
  await waitFor(() =>
    expect(Alert.alert).toHaveBeenLastCalledWith(
      "Couldn't delete save",
      expect.any(String),
    ),
  );
  expect(analytics.itemDeleted).not.toHaveBeenCalled();
});

it("says so when dismissing a suggestion fails", async () => {
  vi.mocked(Alert.alert).mockClear();
  mutate.mockRejectedValueOnce(new Error("offline"));
  render(
    <ItemCard
      item={{ ...base, title: "Miso soup recipe", suggested: true }}
      source={{ from: "space", spaceId: "space-1" }}
    />,
  );
  labelledProps(Pressable, "Miso soup recipe").onAccessibilityAction?.({
    nativeEvent: { actionName: "Dismiss suggestion" },
  } as never);
  await waitFor(() =>
    expect(Alert.alert).toHaveBeenCalledWith(
      "Couldn't change space",
      expect.any(String),
    ),
  );
});

describe("inside a space", () => {
  const inSpace = { from: "space", spaceId: "space-1" } as const;

  function menuIn(item: Partial<FeedItem>) {
    render(<ItemCard item={{ ...base, ...item }} source={inSpace} />);
    return screen.getByTestId("link-menu").textContent;
  }

  it("offers removing it from the space apart from deleting it everywhere", () => {
    const menu = menuIn({ title: "Miso soup recipe" });
    expect(menu).toContain("Remove from this space");
    expect(menu).toContain("Delete everywhere");
  });

  it("keeps plain Delete off the space when opened from Home", () => {
    render(<ItemCard item={{ ...base, title: "Miso soup recipe" }} />);
    const menu = screen.getByTestId("link-menu").textContent;
    expect(menu).not.toContain("Remove from this space");
    expect(menu).not.toContain("Delete everywhere");
  });

  it("takes the save out of this space only", async () => {
    const { Pressable, Alert } = await import("react-native");
    vi.mocked(Alert.alert).mockClear();
    mutate.mockClear();
    render(
      <ItemCard
        item={{ ...base, title: "Miso soup recipe" }}
        source={inSpace}
      />,
    );
    const call = vi
      .mocked(Pressable)
      .mock.calls.findLast(
        ([props]) => props.accessibilityLabel === "Miso soup recipe",
      );
    call?.[0].onAccessibilityAction?.({
      nativeEvent: { actionName: "Remove from this space" },
    } as never);
    expect(mutate).toHaveBeenCalledWith({
      itemId: "item-1",
      spaceId: "space-1",
    });
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it("leaves a suggestion to Add and Dismiss", () => {
    const menu = menuIn({ title: "Miso soup recipe", suggested: true });
    expect(menu).not.toContain("Remove from this space");
  });
});

describe("a save with no picture", () => {
  it("prints a link's summary on its face, under the site's letter, and its title once below", () => {
    render(
      <ItemCard
        item={{
          ...base,
          title: "Poäng armchair",
          description: "A bent birch armchair.",
          url: "https://www.ikea.com/us/en/p/poang-armchair-50240603/",
        }}
      />,
    );
    expect(screen.getByText("I")).toBeTruthy();
    expect(screen.getByText("A bent birch armchair.")).toBeTruthy();
    expect(screen.getAllByText("Poäng armchair")).toHaveLength(1);
  });

  it("puts the title on the face when there is nothing else to print", () => {
    render(
      <ItemCard
        item={{ ...base, title: "Poäng armchair", url: "https://ikea.com" }}
      />,
    );
    expect(screen.getAllByText("Poäng armchair")).toHaveLength(1);
  });

  it("prints a note's own words with its title in the caption", () => {
    render(
      <ItemCard
        item={{
          ...base,
          type: "note",
          title: "Gift ideas",
          note: "Pottery class for Mum",
        }}
      />,
    );
    expect(screen.getByText("Pottery class for Mum")).toBeTruthy();
    expect(screen.getAllByText("Gift ideas")).toHaveLength(1);
  });
});

it("crops the black bars off a YouTube video's 4:3 thumbnail", () => {
  vi.mocked(Image).mockClear();
  render(
    <ItemCard
      item={{
        ...base,
        title: "Never Gonna Give You Up",
        url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        imageUrl: "https://happy-otter-123.convex.cloud/api/storage/0b1c2d3e",
        aspectRatio: 4 / 3,
      }}
    />,
  );
  const picture = vi.mocked(Image).mock.calls[0][0] as {
    contentFit: string;
    style: unknown[];
  };
  expect(picture.contentFit).toBe("cover");
  expect(picture.style[1]).toEqual({ aspectRatio: 16 / 9 });
});

describe("textFaceCopy", () => {
  it("names a save by whatever it has, without repeating it in the caption", () => {
    expect(textFaceCopy({ ...base, title: "Ramen" })).toEqual({
      body: "Ramen",
    });
    expect(textFaceCopy({ ...base, description: "Quick miso ramen." })).toEqual(
      { body: "Quick miso ramen." },
    );
    expect(
      textFaceCopy({ ...base, status: "failed" }, "Couldn't save"),
    ).toEqual({ body: "Couldn't save" });
    expect(textFaceCopy({ ...base, url: "https://www.ikea.com/p/1" })).toEqual({
      body: "ikea.com",
    });
  });

  it("leaves a note's own heading to the caption instead of printing it twice", () => {
    const note = { ...base, type: "note" as const, title: "Mum's Gift Ideas" };
    expect(
      textFaceCopy({
        ...note,
        note: "Gift ideas for Mum\nLinen apron and a good bread knife.",
      }),
    ).toEqual({
      body: "Linen apron and a good bread knife.",
      captionTitle: "Mum's Gift Ideas",
    });
    expect(textFaceCopy({ ...note, note: "Gift ideas for Mum" })).toEqual({
      body: "Gift ideas for Mum",
    });
    expect(
      textFaceCopy({
        ...note,
        note: "Gift ideas for Mum and Dad\nLinen apron.",
      }),
    ).toEqual({
      body: "Gift ideas for Mum and Dad\nLinen apron.",
      captionTitle: "Mum's Gift Ideas",
    });
  });

  it("doesn't repeat a first-line title a note saved without AI carries", () => {
    expect(
      textFaceCopy({
        ...base,
        type: "note",
        title: "Buy oat milk",
        note: "Buy oat milk",
      }),
    ).toEqual({ body: "Buy oat milk" });
    expect(
      textFaceCopy({
        ...base,
        type: "note",
        title: "Pottery class for Mum",
        note: "Pottery class for Mum\nSaturday 10am",
      }),
    ).toEqual({ body: "Saturday 10am", captionTitle: "Pottery class for Mum" });
    expect(
      textFaceCopy({
        ...base,
        type: "note",
        title: "Gift ideas",
        note: "Gift ideas for Mum and Dad\nLinen apron.",
      }),
    ).toEqual({
      body: "Gift ideas for Mum and Dad\nLinen apron.",
      captionTitle: "Gift ideas",
    });
  });

  it("keeps a long first line whole when the title is its 80-character cut", () => {
    const line =
      "Mum said the best route is the coastal path from Cascais to Guincho, stop at the café by the lighthouse for lunch";
    const note = `${line}\nBring sunscreen`;
    expect(
      textFaceCopy({
        ...base,
        type: "note",
        title: line.slice(0, 80),
        note,
      }),
    ).toEqual({ body: note });
    const spaced =
      "Things to pack for the Lisbon trip next month: passport, adapters, sunscreen, a hat and a book";
    expect(spaced[79]).toBe(" ");
    expect(
      textFaceCopy({
        ...base,
        type: "note",
        title: spaced.slice(0, 80),
        note: `${spaced}\nBook the airport taxi`,
      }),
    ).toEqual({ body: `${spaced}\nBook the airport taxi` });
  });

  it("reads a note's words, not a link summary it never has", () => {
    expect(
      textFaceCopy({
        ...base,
        type: "note",
        title: "Gift ideas",
        description: "ignored",
      }),
    ).toEqual({ body: "Gift ideas" });
  });
});

describe("a save that names a place", () => {
  const os = process.env.EXPO_OS;
  afterEach(() => {
    process.env.EXPO_OS = os;
  });

  const place: FeedItem = {
    ...base,
    _creationTime: 1_700_000_000_000,
    title: "Old Town Square",
    url: "https://prague.eu/en/old-town-square",
    intents: [
      { kind: "open_url", label: "Open page", value: "https://prague.eu" },
      { kind: "open_maps", label: "Open in Maps", value: "Old Town Square" },
    ],
  };

  it("opens the place in Maps from the card and logs it once Maps opened", async () => {
    render(<ItemCard item={place} source={{ from: "home" }} />);
    fireEvent.click(screen.getByRole("button", { name: "Open in Maps" }));
    expect(runIntent).toHaveBeenCalledWith("open_maps", "Old Town Square");
    await waitFor(() =>
      expect(analytics.itemAction).toHaveBeenCalledWith(
        expect.objectContaining({ _id: "item-1" }),
        "open_maps",
      ),
    );
  });

  it("reports a Maps launch that fails instead of logging the action", async () => {
    const failure = new Error("no maps");
    vi.mocked(runIntent).mockRejectedValueOnce(failure);
    vi.mocked(analytics.itemAction).mockClear();
    render(<ItemCard item={place} source={{ from: "home" }} />);
    fireEvent.click(screen.getByRole("button", { name: "Open in Maps" }));
    await waitFor(() =>
      expect(analytics.captureError).toHaveBeenCalledWith(
        "card_open_maps_failed",
        failure,
      ),
    );
    expect(analytics.itemAction).not.toHaveBeenCalled();
  });

  it("shows no Maps chip on a save that is not a place", () => {
    render(
      <ItemCard
        item={{ ...place, intents: [place.intents![0]] }}
        source={{ from: "home" }}
      />,
    );
    expect(screen.queryByRole("button", { name: "Open in Maps" })).toBeNull();
  });

  it("offers Open in Maps to VoiceOver, which reads the card as one element", () => {
    process.env.EXPO_OS = "ios";
    vi.mocked(View).mockClear();
    vi.mocked(runIntent).mockClear();
    render(<ItemCard item={place} source={{ from: "home" }} />);
    const props = labelledProps(View, "Old Town Square");
    expect(props.accessibilityActions?.map(({ label }) => label)).toEqual([
      "Share",
      "Change spaces",
      "Delete",
      "Open in Maps",
    ]);
    props.onAccessibilityAction?.({
      nativeEvent: { actionName: "Open in Maps" },
    } as never);
    expect(runIntent).toHaveBeenCalledWith("open_maps", "Old Town Square");
  });

  it("keeps the chip to Home, where the save is the user's own", () => {
    const { rerender } = render(
      <ItemCard item={place} source={{ from: "search", q: "square" }} />,
    );
    expect(screen.queryByRole("button", { name: "Open in Maps" })).toBeNull();
    rerender(
      <ItemCard item={place} source={{ from: "space", spaceId: "space-1" }} />,
    );
    expect(screen.queryByRole("button", { name: "Open in Maps" })).toBeNull();
    rerender(
      <ItemCard
        item={{ ...place, suggested: true }}
        source={{ from: "space", spaceId: "space-1" }}
      />,
    );
    expect(screen.queryByRole("button", { name: "Open in Maps" })).toBeNull();
  });

  it("shows the chip once the save's Maps action arrives", () => {
    const pending = { ...place, intents: undefined };
    const { rerender } = render(
      <ItemCard item={pending} source={{ from: "home" }} />,
    );
    expect(screen.queryByRole("button", { name: "Open in Maps" })).toBeNull();
    rerender(<ItemCard item={place} source={{ from: "home" }} />);
    expect(screen.getByRole("button", { name: "Open in Maps" })).toBeTruthy();
  });

  it("leaves the chip as its own button on Android", () => {
    process.env.EXPO_OS = "android";
    vi.mocked(Pressable).mockClear();
    render(<ItemCard item={place} source={{ from: "home" }} />);
    const props = labelledProps(Pressable, "Old Town Square");
    expect(props.accessibilityActions?.map(({ label }) => label)).toEqual([
      "Share",
      "Change spaces",
      "Delete",
    ]);
    expect(screen.getByRole("button", { name: "Open in Maps" })).toBeTruthy();
  });

  it("opens Maps without logging a save that has no creation time", async () => {
    vi.mocked(analytics.itemAction).mockClear();
    vi.mocked(runIntent).mockClear();
    render(
      <ItemCard
        item={{ ...place, _creationTime: undefined }}
        source={{ from: "home" }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Open in Maps" }));
    await waitFor(() =>
      expect(runIntent).toHaveBeenCalledWith("open_maps", "Old Town Square"),
    );
    await Promise.resolve();
    expect(analytics.itemAction).not.toHaveBeenCalled();
  });
});
