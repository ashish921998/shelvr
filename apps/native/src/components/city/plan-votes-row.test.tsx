// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AskVotesSheet } from "@/components/city/ask-votes-sheet";
import type { CityPin } from "@/lib/city-pins";
import { usePaywallGuard } from "@/lib/entitlement";
import type { VoteLink } from "@/lib/plan-votes";
import type { Id } from "@convex/_generated/dataModel";
import { CityVotes } from "./plan-votes-row";

const mocks = vi.hoisted(() => ({
  capture: vi.fn(),
  captureError: vi.fn(),
  share: vi.fn(),
  pro: true,
  loading: false,
  guard: vi.fn(),
  mounts: 0,
}));

vi.mock("@/lib/analytics", () => ({
  analytics: { capture: mocks.capture, captureError: mocks.captureError },
}));
vi.mock("@/lib/entitlement", () => ({
  usePaywallGuard: vi.fn(() => ({
    guard: mocks.guard,
    loading: mocks.loading,
  })),
}));
vi.mock("@/lib/motion", () => ({ fadeIn: undefined }));
vi.mock("@/components/symbol", () => ({ AppSymbolIcon: vi.fn(() => null) }));
vi.mock("@/components/city/ask-votes-sheet", () => ({
  AskVotesSheet: vi.fn(
    ({ visible, onClose }: { visible: boolean; onClose: () => void }) => {
      useEffect(() => {
        mocks.mounts += 1;
      }, []);
      return visible ? <button onClick={onClose}>close sheet</button> : null;
    },
  ),
}));
vi.mock("convex/react", () => ({ useMutation: vi.fn() }));
vi.mock("@tanstack/react-query", () => ({ useQuery: vi.fn() }));
vi.mock("@convex-dev/react-query", () => ({ convexQuery: vi.fn() }));
vi.mock("expo-router", async () => {
  const { useEffect: useMountEffect } = await import("react");
  return {
    useFocusEffect: (effect: () => undefined | (() => void)) => {
      useMountEffect(() => effect(), [effect]);
    },
  };
});
vi.mock("react-native-reanimated", () => ({
  default: {
    View: vi.fn(({ children }: { children: ReactNode }) => (
      <div>{children}</div>
    )),
  },
}));
vi.mock("react-native-unistyles", () => ({
  StyleSheet: { create: () => ({}) },
  useUnistyles: () => ({ theme: { colors: {} } }),
}));
vi.mock("react-native", () => ({
  Alert: { alert: vi.fn() },
  Share: { share: mocks.share, sharedAction: "sharedAction" },
  View: vi.fn(({ children }: { children: ReactNode }) => (
    <section>{children}</section>
  )),
  Text: vi.fn(({ children }: { children: ReactNode }) => (
    <span>{children}</span>
  )),
  Pressable: vi.fn(
    ({
      children,
      onPress,
      testID,
      accessibilityLabel,
      disabled,
    }: {
      children: ReactNode;
      onPress: () => void;
      testID?: string;
      accessibilityLabel?: string;
      disabled?: boolean;
    }) => (
      <button
        data-testid={testID}
        aria-label={accessibilityLabel}
        disabled={disabled}
        onClick={onPress}
      >
        {children}
      </button>
    ),
  ),
}));

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 10, 6, 12);
const ASK_HINT = "Send a link. They pick the places they'd go to.";

const pin = (name: string, itemId: string): CityPin => ({
  itemId,
  name,
  lat: 30.26,
  lng: -97.74,
  kinds: [],
  number: 1,
});
const pins = [
  pin("Jo's Coffee", "save-jo"),
  pin("Houndstooth Coffee", "save-hound"),
];

function voteLink(over: Partial<VoteLink> = {}): VoteLink {
  return {
    token: "tok-open",
    expiresAt: NOW + 7 * DAY,
    voters: 0,
    places: [
      {
        key: "p0",
        name: "Jo's Coffee",
        itemId: "save-jo" as Id<"items">,
        picks: 0,
        passes: 0,
      },
    ],
    ...over,
  };
}

const waiting = voteLink();
const votes = voteLink({
  expiresAt: NOW + 5 * DAY,
  voters: 2,
  latest: { name: "Sam", place: "Jo's Coffee", choice: "pick" },
});
const closed = voteLink({ expiresAt: NOW - DAY, voters: 2 });

function show(link: VoteLink | null | undefined) {
  return render(
    <CityVotes
      city="Austin"
      pins={pins}
      filtered={pins.slice(1)}
      link={link}
    />,
  );
}

function sheetProps() {
  return vi.mocked(AskVotesSheet).mock.calls.at(-1)?.[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  mocks.pro = true;
  mocks.loading = false;
  mocks.mounts = 0;
  mocks.guard.mockImplementation(async (action?: () => void) => {
    if (!mocks.pro) return false;
    action?.();
    return true;
  });
});

afterEach(() => {
  vi.useRealTimers();
});

async function tap(element: HTMLElement) {
  await act(async () => {
    fireEvent.click(element);
  });
}

describe("CityVotes", () => {
  it("asks someone when there is no link, as one row", () => {
    show(null);
    expect(screen.getByText("Ask someone")).toBeTruthy();
    expect(screen.getByText(ASK_HINT)).toBeTruthy();
    expect(
      screen.getByTestId("plan-votes-row").getAttribute("aria-label"),
    ).toBe(`Ask someone, ${ASK_HINT}`);
    expect(screen.queryByTestId("plan-votes-share")).toBeNull();
  });

  it("waits for votes beside a Share pill", () => {
    show(waiting);
    expect(screen.getByText("No votes yet")).toBeTruthy();
    expect(screen.getByText("7 days left.")).toBeTruthy();
    expect(
      screen.getByTestId("plan-votes-row").getAttribute("aria-label"),
    ).toBe("No votes yet, 7 days left.");
    const share = screen.getByTestId("plan-votes-share");
    expect(share.getAttribute("aria-label")).toBe("Share vote link");
    expect(share.textContent).toBe("Share");
  });

  it("leads with the newest vote", () => {
    show(votes);
    expect(screen.getByText("Sam voted ✓ on Jo's Coffee")).toBeTruthy();
    expect(
      screen.getByText("2 people voted on your link. 5 days left."),
    ).toBeTruthy();
    expect(
      screen.getByTestId("plan-votes-row").getAttribute("aria-label"),
    ).toBe(
      "Sam would go to Jo's Coffee. 2 people voted on your link. 5 days left.",
    );
    expect(screen.getByTestId("plan-votes-share")).toBeTruthy();
  });

  it("says voting closed and asks again, with no Share pill", () => {
    show(closed);
    expect(screen.getByText("Voting closed. 2 people voted.")).toBeTruthy();
    expect(screen.getByText(ASK_HINT)).toBeTruthy();
    expect(screen.queryByTestId("plan-votes-share")).toBeNull();
  });

  it("renders nothing and reports nothing while the link loads", () => {
    const { container } = show(undefined);
    expect(container.innerHTML).toBe("");
    expect(mocks.capture).not.toHaveBeenCalled();
  });

  it("opens no sheet when the paywall stops the ask", async () => {
    mocks.pro = false;
    show(waiting);
    await tap(screen.getByTestId("plan-votes-row"));
    expect(usePaywallGuard).toHaveBeenCalledWith("plan_vote");
    expect(mocks.guard).toHaveBeenCalledTimes(1);
    expect(AskVotesSheet).not.toHaveBeenCalled();
    expect(mocks.capture).not.toHaveBeenCalledWith(
      "plan_ask_opened",
      expect.anything(),
    );
  });

  it("opens the sheet with the open link, and with none for a closed link", async () => {
    const { rerender } = show(votes);
    await tap(screen.getByTestId("plan-votes-row"));
    expect(sheetProps()).toMatchObject({
      visible: true,
      city: "Austin",
      pins,
      filtered: [pins[1]],
      link: votes,
    });
    expect(mocks.capture).toHaveBeenCalledWith("plan_ask_opened", {
      has_link: true,
    });

    fireEvent.click(screen.getByText("close sheet"));
    expect(sheetProps()?.visible).toBe(false);

    rerender(
      <CityVotes city="Austin" pins={pins} filtered={pins} link={closed} />,
    );
    await tap(screen.getByTestId("plan-votes-row"));
    expect(sheetProps()).toMatchObject({ visible: true, link: null });
    expect(mocks.capture).toHaveBeenLastCalledWith("plan_ask_opened", {
      has_link: false,
    });
    expect(mocks.mounts).toBe(2);
  });

  it("opens the sheet with no link from the ask row", async () => {
    show(null);
    await tap(screen.getByTestId("plan-votes-row"));
    expect(sheetProps()).toMatchObject({ visible: true, link: null });
  });

  it("shares the open link from the pill without the paywall", async () => {
    mocks.share.mockResolvedValue({ action: "sharedAction" });
    show(votes);
    await tap(screen.getByTestId("plan-votes-share"));
    expect(mocks.guard).not.toHaveBeenCalled();
    expect(mocks.share).toHaveBeenCalledWith({
      message: expect.stringMatching(/\/p\/tok-open$/),
    });
    expect(mocks.capture).toHaveBeenLastCalledWith("plan_link_reshared", {
      shared: true,
    });

    const error = new Error("share failed");
    mocks.share.mockRejectedValue(error);
    await tap(screen.getByTestId("plan-votes-share"));
    expect(mocks.capture).toHaveBeenLastCalledWith("plan_ask_failed", {
      reason: "share",
    });
    expect(mocks.captureError).toHaveBeenCalledWith("plan_ask_failed", error);
  });

  it("reports the link it saw once, the first time one arrives", () => {
    const { rerender } = show(null);
    expect(mocks.capture).not.toHaveBeenCalled();
    rerender(
      <CityVotes city="Austin" pins={pins} filtered={pins} link={votes} />,
    );
    rerender(
      <CityVotes
        city="Austin"
        pins={pins}
        filtered={pins}
        link={{ ...votes, voters: 3 }}
      />,
    );
    expect(mocks.capture.mock.calls).toEqual([
      ["plan_votes_seen", { voters: 2, open: true }],
    ]);
  });

  it("reports a closed link as closed", () => {
    show(closed);
    expect(mocks.capture.mock.calls).toEqual([
      ["plan_votes_seen", { voters: 2, open: false }],
    ]);
  });

  it("holds the ask while the entitlement loads, but still shares", async () => {
    mocks.loading = true;
    mocks.share.mockResolvedValue({ action: "sharedAction" });
    show(waiting);
    const row = screen.getByTestId("plan-votes-row") as HTMLButtonElement;
    expect(row.disabled).toBe(true);
    await tap(row);
    expect(mocks.guard).not.toHaveBeenCalled();
    await tap(screen.getByTestId("plan-votes-share"));
    expect(mocks.share).toHaveBeenCalledTimes(1);
  });
});
