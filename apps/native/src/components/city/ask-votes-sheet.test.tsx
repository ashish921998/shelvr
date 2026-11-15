// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CityPin } from "@/lib/city-pins";
import type { VoteLink } from "@/lib/plan-votes";
import type { Id } from "@convex/_generated/dataModel";
import { AskVotesSheet } from "./ask-votes-sheet";

const mocks = vi.hoisted(() => ({
  selection: vi.fn(),
  send: vi.fn(),
  flush: vi.fn(),
  busy: false,
  ask: [] as unknown[],
}));

vi.mock("@/lib/analytics", () => ({
  analytics: { capture: vi.fn(), captureError: vi.fn() },
}));
vi.mock("@/lib/haptics", () => ({
  haptics: { selection: mocks.selection },
}));
vi.mock("@/lib/plan-votes", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/plan-votes")>()),
  useAskVotes: (...args: unknown[]) => {
    mocks.ask = args;
    return { busy: mocks.busy, send: mocks.send, flush: mocks.flush };
  },
}));
vi.mock("convex/react", () => ({ useMutation: vi.fn() }));
vi.mock("@tanstack/react-query", () => ({ useQuery: vi.fn() }));
vi.mock("@convex-dev/react-query", () => ({ convexQuery: vi.fn() }));
vi.mock("expo-router", () => ({ useFocusEffect: vi.fn() }));
vi.mock("@/components/symbol", () => ({ AppSymbolIcon: vi.fn(() => null) }));
vi.mock("@/components/ui/themed-text", () => ({
  ThemedText: vi.fn(({ children }: { children: ReactNode }) => (
    <span>{children}</span>
  )),
}));
vi.mock("@/components/ui/button", () => ({
  Button: vi.fn(
    ({
      title,
      testID,
      disabled,
      loading,
      onPress,
    }: {
      title: string;
      testID: string;
      disabled: boolean;
      loading: boolean;
      onPress: () => void;
    }) => (
      <button
        data-testid={testID}
        aria-busy={loading}
        disabled={disabled || loading}
        onClick={onPress}
      >
        {title}
      </button>
    ),
  ),
}));
vi.mock("@/components/ui/prompt-sheet", () => ({
  PromptSheet: vi.fn(
    ({
      visible,
      title,
      body,
      children,
      actions,
      testID,
      onDismiss,
    }: {
      visible: boolean;
      title: string;
      body: string;
      children: ReactNode;
      actions: ReactNode;
      testID: string;
      onDismiss: () => void;
    }) => (
      <>
        {visible ? (
          <div data-testid={testID}>
            <h1>{title}</h1>
            <p>{body}</p>
            {children}
            {actions}
          </div>
        ) : null}
        <button onClick={onDismiss}>dismissed</button>
      </>
    ),
  ),
}));
vi.mock("react-native-unistyles", () => ({
  StyleSheet: { create: () => ({}), hairlineWidth: 1 },
  useUnistyles: () => ({ theme: { colors: {} } }),
}));
vi.mock("react-native", () => ({
  Alert: { alert: vi.fn() },
  Share: { share: vi.fn(), sharedAction: "sharedAction" },
  View: vi.fn(({ children }: { children: ReactNode }) => (
    <section>{children}</section>
  )),
  ScrollView: vi.fn(({ children }: { children: ReactNode }) => (
    <section>{children}</section>
  )),
  Pressable: vi.fn(
    ({
      children,
      onPress,
      testID,
      accessibilityRole,
      accessibilityLabel,
      accessibilityState,
      disabled,
    }: {
      children: ReactNode;
      onPress: () => void;
      testID?: string;
      accessibilityRole?: string;
      accessibilityLabel?: string;
      accessibilityState?: { checked?: boolean };
      disabled?: boolean;
    }) => (
      <button
        data-testid={testID}
        role={accessibilityRole}
        aria-label={accessibilityLabel}
        aria-checked={accessibilityState?.checked}
        disabled={disabled}
        onClick={onPress}
      >
        {children}
      </button>
    ),
  ),
}));

const HINT =
  "Changing the places makes a new link. Votes on the old one stop showing here.";

function pin(name: string, itemId: string, category?: string): CityPin {
  return {
    itemId,
    name,
    lat: 30.26,
    lng: -97.74,
    category,
    kinds: [],
    number: 1,
  };
}

const jo = pin("Jo's Coffee", "save-jo", "Cafe");
const hound = pin("Houndstooth Coffee", "save-hound");
const many = [
  jo,
  hound,
  pin("Veracruz All Natural", "save-vera"),
  pin("Zilker Park", "save-zilker"),
  pin("Torchy's Tacos", "save-torchy"),
  pin("Franklin Barbecue", "save-franklin"),
];

const open: VoteLink = {
  token: "tok-open",
  expiresAt: Date.now() + 1000,
  voters: 1,
  places: [jo, hound].map((from, index) => ({
    key: `p${index}`,
    name: from.name,
    itemId: from.itemId as Id<"items">,
    picks: 0,
    passes: 0,
  })),
};

const onClose = vi.fn();

function show(
  link: VoteLink | null,
  options: { pins?: CityPin[]; filtered?: CityPin[] } = {},
) {
  const pins = options.pins ?? many;
  return render(
    <AskVotesSheet
      visible
      city="Austin"
      pins={pins}
      filtered={options.filtered ?? pins}
      link={link}
      onClose={onClose}
    />,
  );
}

const box = (index: number) =>
  screen.getByTestId(`ask-votes-place-${index}`) as HTMLButtonElement;
const checked = () =>
  many.map((_, index) => box(index).getAttribute("aria-checked") === "true");

beforeEach(() => {
  vi.clearAllMocks();
  mocks.busy = false;
  mocks.send.mockResolvedValue(true);
  mocks.flush.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("AskVotesSheet", () => {
  it("asks for up to five places, one checkbox per place with its category", () => {
    show(null);
    expect(screen.getByTestId("ask-votes-sheet")).toBeTruthy();
    expect(screen.getByText("Ask someone")).toBeTruthy();
    expect(
      screen.getByText(
        "Pick up to 5 places. They tap ✓ on the ones they'd go to, and the votes show up here.",
      ),
    ).toBeTruthy();
    expect(box(0).getAttribute("role")).toBe("checkbox");
    expect(box(0).getAttribute("aria-label")).toBe("Jo's Coffee, ☕ Café");
    expect(box(1).getAttribute("aria-label")).toBe("Houndstooth Coffee");
    expect(screen.getByTestId("ask-votes-send").textContent).toBe(
      "Send vote link",
    );
    expect(mocks.ask).toEqual(["Austin", null, many]);
  });

  it("preselects the open link's places", () => {
    show(open);
    expect(checked()).toEqual([true, true, false, false, false, false]);
  });

  it("preselects the first five shown places without an open link", () => {
    show(null, { filtered: many.slice(1) });
    expect(checked()).toEqual([false, true, true, true, true, true]);
  });

  it("disables the sixth place at five, until one is unchecked", () => {
    show(null);
    expect(checked()).toEqual([true, true, true, true, true, false]);
    expect(box(5).disabled).toBe(true);
    expect(box(0).disabled).toBe(false);
    fireEvent.click(box(0));
    expect(box(5).disabled).toBe(false);
    fireEvent.click(box(5));
    expect(checked()).toEqual([false, true, true, true, true, true]);
    expect(box(0).disabled).toBe(true);
    expect(mocks.selection).toHaveBeenCalledTimes(2);
  });

  it("warns of a new link only when the places differ from the open link", () => {
    show(open);
    expect(screen.queryByText(HINT)).toBeNull();
    fireEvent.click(box(2));
    expect(screen.getByText(HINT)).toBeTruthy();
    fireEvent.click(box(2));
    expect(screen.queryByText(HINT)).toBeNull();
    fireEvent.click(box(1));
    expect(screen.getByText(HINT)).toBeTruthy();
  });

  it("never warns without an open link", () => {
    show(null);
    fireEvent.click(box(0));
    expect(screen.queryByText(HINT)).toBeNull();
  });

  it("cannot send with nothing picked, and waits while the link is made", () => {
    const { rerender } = show(null, { filtered: [] });
    const send = screen.getByTestId("ask-votes-send") as HTMLButtonElement;
    expect(send.disabled).toBe(true);
    fireEvent.click(box(3));
    expect(send.disabled).toBe(false);
    mocks.busy = true;
    rerender(
      <AskVotesSheet
        visible
        city="Austin"
        pins={many}
        filtered={[]}
        link={null}
        onClose={onClose}
      />,
    );
    expect(send.getAttribute("aria-busy")).toBe("true");
  });

  it("sends the picked places in page order", async () => {
    show(null, { filtered: [] });
    fireEvent.click(box(3));
    fireEvent.click(box(0));
    await act(async () => {
      fireEvent.click(screen.getByTestId("ask-votes-send"));
    });
    expect(mocks.send).toHaveBeenCalledWith([jo, many[3]]);
  });

  it("closes on iOS and shares once the sheet is gone", async () => {
    vi.stubEnv("EXPO_OS", "ios");
    show(open);
    await act(async () => {
      fireEvent.click(screen.getByTestId("ask-votes-send"));
    });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(mocks.flush).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("dismissed"));
    expect(mocks.flush).toHaveBeenCalledTimes(1);
  });

  it("closes and shares at once on Android", async () => {
    vi.stubEnv("EXPO_OS", "android");
    show(open);
    await act(async () => {
      fireEvent.click(screen.getByTestId("ask-votes-send"));
    });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(mocks.flush).toHaveBeenCalledTimes(1);
  });

  it("stays open when the link could not be made", async () => {
    vi.stubEnv("EXPO_OS", "android");
    mocks.send.mockResolvedValue(false);
    show(open);
    await act(async () => {
      fireEvent.click(screen.getByTestId("ask-votes-send"));
    });
    expect(onClose).not.toHaveBeenCalled();
    expect(mocks.flush).not.toHaveBeenCalled();
  });
});
