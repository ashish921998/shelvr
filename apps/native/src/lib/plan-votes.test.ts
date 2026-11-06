// @vitest-environment jsdom
import type { CityPin } from "@/lib/city-pins";
import { cityPinId } from "@/lib/city-pins";
import { t } from "@/lib/i18n";
import type { Id } from "@convex/_generated/dataModel";
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  initialChoice,
  type LinkPlace,
  linkPlaceFor,
  sameShortlist,
  shareVoteLink,
  tallyFor,
  useAskVotes,
  useClock,
  useVoteLink,
  type VoteLink,
  votesRow,
} from "./plan-votes";

const mocks = vi.hoisted(() => ({
  capture: vi.fn(),
  captureError: vi.fn(),
  alert: vi.fn(),
  share: vi.fn(),
  ensureCitySpace: vi.fn(),
  createPlanShare: vi.fn(),
  queries: [] as { name: string; args: unknown }[],
  data: undefined as unknown,
  focused: true,
}));

vi.mock("@/lib/analytics", () => ({
  analytics: { capture: mocks.capture, captureError: mocks.captureError },
}));
vi.mock("react-native", () => ({
  Alert: { alert: mocks.alert },
  Share: {
    share: mocks.share,
    sharedAction: "sharedAction",
    dismissedAction: "dismissedAction",
  },
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: (query: { name: string; args: unknown }) => {
    mocks.queries.push(query);
    return { data: mocks.data };
  },
}));
vi.mock("@convex-dev/react-query", async () => {
  const { getFunctionName } = await import("convex/server");
  return {
    convexQuery: (fn: never, args: unknown) => ({
      name: getFunctionName(fn),
      args,
    }),
  };
});
vi.mock("convex/react", async () => {
  const { getFunctionName } = await import("convex/server");
  const byName: Record<string, unknown> = {
    "spaces:ensureCitySpace": mocks.ensureCitySpace,
    "planShares:createPlanShare": mocks.createPlanShare,
  };
  return { useMutation: (fn: never) => byName[getFunctionName(fn)] };
});
vi.mock("expo-router", async () => {
  const { useEffect } = await import("react");
  return {
    useFocusEffect: (effect: () => undefined | (() => void)) => {
      const focused = mocks.focused;
      useEffect(() => (focused ? effect() : undefined), [effect, focused]);
    },
  };
});

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
const NOW = Date.UTC(2026, 10, 6, 12);
const ASK_HINT = "Send a link. They pick the places they'd go to.";
const ASK_TEXT = "Where should we go? Tap ✓ on the ones you'd go to:";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.queries = [];
  mocks.data = undefined;
  mocks.focused = true;
  vi.stubEnv("EXPO_PUBLIC_WEB_URL", "https://web.test");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

function pin(name: string, itemId: string, lat = 30.26): CityPin {
  return { itemId, name, lat, lng: -97.74, kinds: [], number: 1 };
}

function place(key: string, from: CityPin, over: Partial<LinkPlace> = {}) {
  return {
    key,
    name: from.name,
    itemId: from.itemId as Id<"items">,
    picks: 0,
    passes: 0,
    ...over,
  };
}

function voteLink(over: Partial<VoteLink> = {}): VoteLink {
  return {
    token: "tok-open",
    expiresAt: NOW + 5 * DAY,
    voters: 0,
    places: [],
    ...over,
  };
}

const jo = pin("Jo's Coffee", "save-jo", 30.1);
const hound = pin("Houndstooth Coffee", "save-hound", 30.2);
const veracruz = pin("Veracruz All Natural", "save-vera", 30.3);
const pins = [jo, hound, veracruz];

describe("votesRow", () => {
  const ask = {
    kind: "ask",
    title: "Ask someone",
    subtitle: ASK_HINT,
    label: `Ask someone, ${ASK_HINT}`,
  };

  it("asks when there is no link, or a closed link nobody voted on", () => {
    expect(votesRow(null, NOW)).toEqual(ask);
    expect(votesRow(voteLink({ expiresAt: NOW }), NOW)).toEqual(ask);
  });

  it("says voting closed, with how many voted, once the link has closed", () => {
    expect(
      votesRow(voteLink({ expiresAt: NOW - DAY, voters: 2 }), NOW),
    ).toEqual({
      kind: "closed",
      title: "Voting closed. 2 people voted.",
      subtitle: ASK_HINT,
      label: `Voting closed. 2 people voted. ${ASK_HINT}`,
    });
    expect(votesRow(voteLink({ expiresAt: NOW, voters: 1 }), NOW).title).toBe(
      "Voting closed. 1 person voted.",
    );
  });

  it("waits for votes on an open link, with the days left and its token", () => {
    expect(votesRow(voteLink({ expiresAt: NOW + 7 * DAY }), NOW)).toEqual({
      kind: "waiting",
      title: "No votes yet",
      subtitle: "7 days left.",
      label: "No votes yet, 7 days left.",
      token: "tok-open",
    });
  });

  it("leads with the newest choice and reads it as a sentence", () => {
    const link = voteLink({
      voters: 2,
      latest: { name: "Sam", place: "Jo's Coffee", choice: "pick" },
    });
    expect(votesRow(link, NOW)).toEqual({
      kind: "votes",
      title: "Sam voted ✓ on Jo's Coffee",
      subtitle: "2 people voted on your link. 5 days left.",
      label:
        "Sam would go to Jo's Coffee. 2 people voted on your link. 5 days left.",
      token: "tok-open",
    });
  });

  it("shows a pass, and says someone when the voter gave no name", () => {
    const row = (latest: VoteLink["latest"]) =>
      votesRow(voteLink({ voters: 1, latest }), NOW);
    const pass = row({ name: "Maya", place: "Jo's Coffee", choice: "pass" });
    expect(pass.title).toBe("Maya voted ✕ on Jo's Coffee");
    expect(pass.label).toBe(
      "Maya would pass on Jo's Coffee. 1 person voted on your link. 5 days left.",
    );
    const pick = row({ place: "Jo's Coffee", choice: "pick" });
    expect(pick.title).toBe("Someone voted ✓ on Jo's Coffee");
    expect(pick.label).toMatch(/^Someone would go to Jo's Coffee\. 1 person/);
    const passed = row({ place: "Jo's Coffee", choice: "pass" });
    expect(passed.title).toBe("Someone voted ✕ on Jo's Coffee");
    expect(passed.label).toMatch(/^Someone would pass on Jo's Coffee\. 1/);
  });

  it("titles the voter count when no vote says which choice came last", () => {
    expect(votesRow(voteLink({ voters: 2 }), NOW)).toEqual({
      kind: "votes",
      title: "2 people voted on your link.",
      subtitle: "5 days left.",
      label: "2 people voted on your link. 5 days left.",
      token: "tok-open",
    });
  });

  it("counts whole days left, never more than seven and never fewer than one", () => {
    const days = (expiresAt: number) =>
      votesRow(voteLink({ expiresAt }), NOW).subtitle;
    expect(days(NOW + 7 * DAY)).toBe("7 days left.");
    expect(days(NOW + 7 * DAY + 5 * MINUTE)).toBe("7 days left.");
    expect(days(NOW + 6 * DAY + MINUTE)).toBe("7 days left.");
    expect(days(NOW + 6 * DAY)).toBe("6 days left.");
    expect(days(NOW + MINUTE)).toBe("1 day left.");
  });
});

describe("linkPlaceFor and tallyFor", () => {
  const link = voteLink({
    voters: 2,
    places: [
      place("p0", jo, { picks: 1 }),
      place("p1", hound, { picks: 1, passes: 1 }),
    ],
  });

  it("matches a pin to the place made from its save", () => {
    expect(linkPlaceFor(link, jo, pins)?.key).toBe("p0");
    expect(tallyFor(link, jo, pins)).toEqual({ picks: 1, passes: 0 });
    expect(tallyFor(link, hound, pins)).toEqual({ picks: 1, passes: 1 });
  });

  it("falls back to the one pin with that name when the link came from another save", () => {
    const fixture = voteLink({
      voters: 2,
      places: [place("p0", pin("Jo’s coffee", "fixture-save"), { picks: 1 })],
    });
    expect(linkPlaceFor(fixture, jo, pins)?.key).toBe("p0");
    expect(tallyFor(fixture, jo, pins)).toEqual({ picks: 1, passes: 0 });
  });

  it("tallies only the branch the link was made from when two saves name one chain", () => {
    const north = pin("Starbucks", "save-north", 30.4);
    const south = pin("Starbucks", "save-south", 30.5);
    const chain = voteLink({
      voters: 1,
      places: [place("p0", north, { picks: 1 })],
    });
    const all = [north, south];
    expect(tallyFor(chain, north, all)).toEqual({ picks: 1, passes: 0 });
    expect(tallyFor(chain, south, all)).toBeUndefined();
  });

  it("matches neither of two same-name pins from one save", () => {
    const first = pin("Starbucks", "save-1", 30.4);
    const second = pin("Starbucks", "save-1", 30.5);
    const chain = voteLink({ voters: 1, places: [place("p0", first)] });
    expect(linkPlaceFor(chain, first, [first, second])).toBeUndefined();
    expect(linkPlaceFor(chain, second, [first, second])).toBeUndefined();
  });

  it("has no tally off the link, before any vote, or without a link", () => {
    expect(tallyFor(link, veracruz, pins)).toBeUndefined();
    expect(tallyFor({ ...link, voters: 0 }, jo, pins)).toBeUndefined();
    expect(tallyFor(null, jo, pins)).toBeUndefined();
    expect(tallyFor(undefined, jo, pins)).toBeUndefined();
  });
});

describe("initialChoice", () => {
  it("starts from the open link's places, in page order", () => {
    const link = voteLink({ places: [place("p0", veracruz), place("p1", jo)] });
    expect(initialChoice(pins, [hound], link)).toEqual([
      cityPinId(jo),
      cityPinId(veracruz),
    ]);
  });

  it("starts from the first five shown pins without an open link, or when none maps", () => {
    const many = Array.from({ length: 7 }, (_, index) =>
      pin(`Place ${index}`, `save-${index}`, index),
    );
    const firstFive = many.slice(0, 5).map(cityPinId);
    expect(initialChoice(pins, many, null)).toEqual(firstFive);
    const elsewhere = voteLink({
      places: [place("p0", pin("Somewhere else", "save-x"))],
    });
    expect(initialChoice(pins, many, elsewhere)).toEqual(firstFive);
  });
});

describe("sameShortlist", () => {
  const link = voteLink({ places: [place("p0", jo), place("p1", hound)] });

  it("is true for the link's own places in any order", () => {
    expect(sameShortlist(link, [hound, jo], pins)).toBe(true);
  });

  it("is false with a place missing, a place added, or a pin off the link", () => {
    expect(sameShortlist(link, [jo], pins)).toBe(false);
    expect(sameShortlist(link, [jo, hound, veracruz], pins)).toBe(false);
    expect(sameShortlist(link, [jo, veracruz], pins)).toBe(false);
  });

  it("is false when one place is chosen twice", () => {
    expect(sameShortlist(link, [jo, jo], pins)).toBe(false);
  });
});

describe("shareVoteLink", () => {
  it("shares the ask with the vote page link and says whether it went out", async () => {
    mocks.share.mockResolvedValue({ action: "sharedAction" });
    await expect(shareVoteLink("a b/c")).resolves.toBe(true);
    expect(mocks.share).toHaveBeenCalledWith({
      message: `${ASK_TEXT} https://web.test/p/a%20b%2Fc`,
    });
    mocks.share.mockResolvedValue({ action: "dismissedAction" });
    await expect(shareVoteLink("tok")).resolves.toBe(false);
  });

  it("lets a failed share reach the caller", async () => {
    const error = new Error("share failed");
    mocks.share.mockRejectedValue(error);
    await expect(shareVoteLink("tok")).rejects.toBe(error);
  });
});

describe("useVoteLink", () => {
  it("reads the city's newest link", () => {
    const link = voteLink();
    mocks.data = link;
    const { result } = renderHook(() => useVoteLink("Austin"));
    expect(result.current).toBe(link);
    expect(mocks.queries.at(-1)).toEqual({
      name: "planShares:cityPlanVotes",
      args: { city: "Austin" },
    });
  });
});

describe("useClock", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  it("ticks each minute, so a link that closes while shown turns closed", () => {
    const link = voteLink({ voters: 2, expiresAt: NOW + 30_000 });
    const { result } = renderHook(() => votesRow(link, useClock()).kind);
    expect(result.current).toBe("votes");
    act(() => {
      vi.advanceTimersByTime(MINUTE);
    });
    expect(result.current).toBe("closed");
  });

  it("stops while the screen is away and reads the time again on return", () => {
    const { result, rerender } = renderHook(() => useClock());
    expect(result.current).toBe(NOW);
    mocks.focused = false;
    rerender();
    expect(vi.getTimerCount()).toBe(0);
    act(() => {
      vi.advanceTimersByTime(5 * MINUTE);
    });
    expect(result.current).toBe(NOW);
    mocks.focused = true;
    rerender();
    expect(result.current).toBe(NOW + 5 * MINUTE);
    expect(vi.getTimerCount()).toBe(1);
  });
});

describe("useAskVotes", () => {
  const open = voteLink({
    voters: 1,
    places: [place("p0", jo), place("p1", hound)],
  });

  it("reuses the open link for the same shortlist, with no backend call", async () => {
    mocks.share.mockResolvedValue({ action: "sharedAction" });
    const { result } = renderHook(() => useAskVotes("Austin", open, pins));
    let sent = false;
    await act(async () => {
      sent = await result.current.send([hound, jo]);
    });
    expect(sent).toBe(true);
    expect(mocks.ensureCitySpace).not.toHaveBeenCalled();
    expect(mocks.createPlanShare).not.toHaveBeenCalled();
    await act(() => result.current.flush());
    expect(mocks.share).toHaveBeenCalledWith({
      message: `${ASK_TEXT} https://web.test/p/tok-open`,
    });
    expect(mocks.capture.mock.calls).toEqual([
      ["plan_asked", { place_count: 2, reused: true }],
    ]);
  });

  it("makes a new link for a changed shortlist, with no notes and no repeated place", async () => {
    let space: (id: string) => void = () => {};
    mocks.ensureCitySpace.mockReturnValue(
      new Promise((resolve) => {
        space = resolve;
      }),
    );
    mocks.createPlanShare.mockResolvedValue("tok-new");
    mocks.share.mockResolvedValue({ action: "sharedAction" });
    const twin = pin("Jo's Coffee", "save-jo", 30.9);
    const { result } = renderHook(() => useAskVotes("Austin", open, pins));
    let sending: Promise<boolean> = Promise.resolve(false);
    act(() => {
      sending = result.current.send([jo, twin, veracruz]);
    });
    expect(result.current.busy).toBe(true);
    await act(async () => {
      space("space-1");
      await sending;
    });
    await expect(sending).resolves.toBe(true);
    expect(result.current.busy).toBe(false);
    expect(mocks.ensureCitySpace).toHaveBeenCalledWith({ city: "Austin" });
    expect(mocks.createPlanShare).toHaveBeenCalledWith({
      spaceId: "space-1",
      city: "Austin",
      places: [
        { name: "Jo's Coffee", why: "", itemId: "save-jo" },
        { name: "Veracruz All Natural", why: "", itemId: "save-vera" },
      ],
    });
    await act(() => result.current.flush());
    expect(mocks.share).toHaveBeenCalledWith({
      message: `${ASK_TEXT} https://web.test/p/tok-new`,
    });
    expect(mocks.capture.mock.calls).toEqual([
      ["plan_asked", { place_count: 2, reused: false }],
    ]);
  });

  it("alerts and reports when the link cannot be made, and shares nothing", async () => {
    const error = new Error("rate_limited");
    mocks.ensureCitySpace.mockRejectedValue(error);
    const { result } = renderHook(() => useAskVotes("Austin", null, pins));
    let sent = true;
    await act(async () => {
      sent = await result.current.send([jo]);
    });
    expect(sent).toBe(false);
    expect(result.current.busy).toBe(false);
    expect(mocks.createPlanShare).not.toHaveBeenCalled();
    expect(mocks.alert).toHaveBeenCalledWith(
      "Couldn't make a vote link",
      t("errors.retrySoon"),
    );
    expect(mocks.capture.mock.calls).toEqual([
      ["plan_ask_failed", { reason: "link" }],
    ]);
    expect(mocks.captureError).toHaveBeenCalledWith("plan_ask_failed", error);
    await act(() => result.current.flush());
    expect(mocks.share).not.toHaveBeenCalled();
  });

  it("reports a share only when it went out, and a share that throws without an alert", async () => {
    const { result } = renderHook(() => useAskVotes("Austin", open, pins));
    mocks.share.mockResolvedValue({ action: "dismissedAction" });
    await act(async () => {
      await result.current.send([jo, hound]);
    });
    await act(() => result.current.flush());
    expect(mocks.capture).not.toHaveBeenCalled();

    const error = new Error("share failed");
    mocks.share.mockRejectedValue(error);
    await act(async () => {
      await result.current.send([jo, hound]);
    });
    await act(() => result.current.flush());
    expect(mocks.capture.mock.calls).toEqual([
      ["plan_ask_failed", { reason: "share" }],
    ]);
    expect(mocks.captureError).toHaveBeenCalledWith("plan_ask_failed", error);
    expect(mocks.alert).not.toHaveBeenCalled();
  });

  it("does nothing on a flush with nothing waiting, or a second flush", async () => {
    mocks.share.mockResolvedValue({ action: "sharedAction" });
    const { result } = renderHook(() => useAskVotes("Austin", open, pins));
    await act(() => result.current.flush());
    expect(mocks.share).not.toHaveBeenCalled();
    await act(async () => {
      await result.current.send([jo, hound]);
    });
    await act(() => result.current.flush());
    await act(() => result.current.flush());
    expect(mocks.share).toHaveBeenCalledTimes(1);
    expect(mocks.capture).toHaveBeenCalledTimes(1);
  });
});
