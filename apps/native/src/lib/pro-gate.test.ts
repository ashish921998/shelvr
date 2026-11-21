// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { ConvexError } from "convex/values";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Access } from "@/lib/access";
import { forgetPaywallFunnel, recordAccess } from "@/lib/paywall-funnel";
import { useProGate, type ProPlacement } from "@/lib/pro-gate";

const mocks = vi.hoisted(() => ({
  access: { kind: "loading" } as Access,
  sheet: vi.fn(),
  capture: vi.fn(),
  router: { push: vi.fn() },
}));

vi.mock("expo-router", () => ({ useRouter: () => mocks.router }));
vi.mock("@/lib/free-plan", () => ({ useAccess: () => mocks.access }));
vi.mock("@/lib/entitlement", () => ({ openPaywallAnswer: mocks.sheet }));
vi.mock("@/lib/analytics", () => ({ analytics: { capture: mocks.capture } }));
vi.mock("@/lib/revenuecat-module", () => ({ getPurchases: () => null }));
vi.mock("@/lib/paywall-goal", () => ({}));
vi.mock("@/lib/trial-reminder-lead", () => ({}));
vi.mock("@/lib/date", () => ({}));
vi.mock("@/lib/i18n", () => ({}));

const PLACEMENTS: ProPlacement[] = [
  "home",
  "add",
  "share",
  "remove_place",
  "mark_visited",
  "passport",
  "passport_friend_places",
  "make_plan",
  "plan_trip",
  "shared_list",
  "edit_places",
  "item_detail",
  "plan_vote",
];

const free = { limit: 10, used: 3, left: 7, pending: 0, open: true };
const PRO_REQUIRED = new ConvexError({ code: "pro_required" });

function gate(placement: ProPlacement) {
  return renderHook(() => useProGate(placement)).result;
}

function gateWithAccess(placement: ProPlacement) {
  return renderHook(() => useProGate(placement));
}

const PRO: Access = { kind: "pro", syncing: false };

function buyInSheet() {
  mocks.sheet.mockImplementation(async () => {
    recordAccess("purchase");
    mocks.access = PRO;
    return { outcome: "success", answered: true };
  });
}

function resumed() {
  return mocks.capture.mock.calls.filter(
    ([event]) => event === "paywall_blocked_action_resumed",
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  forgetPaywallFunnel();
  mocks.sheet.mockResolvedValue({ outcome: "cancelled", answered: true });
  mocks.access = { kind: "free", ...free };
});

describe.each(PLACEMENTS)("%s", (placement) => {
  it("opens the paywall on a Pro refusal and reports the next pass as resumed after a purchase", async () => {
    buyInSheet();
    const { result, rerender } = gateWithAccess(placement);
    await act(async () => {
      expect(await result.current.denied(PRO_REQUIRED)).toBe(true);
    });
    expect(mocks.sheet).toHaveBeenCalledWith(mocks.router, placement);

    rerender();
    act(() => result.current.passed());
    expect(resumed()).toEqual([
      [
        "paywall_blocked_action_resumed",
        {
          placement,
          delay_ms: expect.any(Number),
          purchased_since_block: true,
        },
      ],
    ]);
  });
});

describe("denied", () => {
  it("leaves any other failure to the caller", async () => {
    const result = gate("remove_place");
    await act(async () => {
      expect(await result.current.denied(new Error("offline"))).toBe(false);
    });
    expect(mocks.sheet).not.toHaveBeenCalled();
  });

  it("shows no paywall and records no block when the app already sees Pro", async () => {
    mocks.access = { kind: "pro", syncing: false };
    const result = gate("mark_visited");
    await act(async () => {
      expect(await result.current.denied(PRO_REQUIRED)).toBe(false);
    });
    act(() => result.current.passed());
    expect(mocks.sheet).not.toHaveBeenCalled();
    expect(resumed()).toEqual([]);
  });

  it("reports nothing for a pass the app does not see as Pro", async () => {
    const result = gate("home");
    await act(() => result.current.denied(PRO_REQUIRED));
    act(() => result.current.passed());
    expect(resumed()).toEqual([]);
  });

  it("reports a later Pro pass without a purchase when the sheet was closed", async () => {
    const { result, rerender } = gateWithAccess("add");
    await act(() => result.current.denied(PRO_REQUIRED));
    mocks.access = PRO;
    rerender();
    act(() => result.current.passed());
    expect(resumed()[0]?.[1]).toMatchObject({ purchased_since_block: false });
  });
});

describe("admit", () => {
  const cases: [string, Access, ProPlacement, string][] = [
    ["Pro", { kind: "pro", syncing: false }, "edit_places", "go"],
    [
      "a purchase still syncing",
      { kind: "pro", syncing: true },
      "home",
      "wait",
    ],
    ["loading", { kind: "loading" }, "plan_vote", "wait"],
    ["a free save left on Home", { kind: "free", ...free }, "home", "go"],
    [
      "a free plan elsewhere",
      { kind: "free", ...free },
      "plan_vote",
      "paywalled",
    ],
    [
      "no free saves left",
      { kind: "free", ...free, used: 10, left: 0 },
      "home",
      "paywalled",
    ],
    [
      "a closed free plan",
      { kind: "free", ...free, open: false },
      "home",
      "paywalled",
    ],
    ["a locked account", { kind: "locked" }, "home", "paywalled"],
    ["signed out", { kind: "signedOut" }, "shared_list", "paywalled"],
  ];

  it.each(cases)("with %s", async (_name, access, placement, verdict) => {
    mocks.access = access;
    const result = gate(placement);
    await act(async () => {
      expect(await result.current.admit()).toBe(verdict);
    });
    expect(result.current.loading).toBe(verdict === "wait");
    expect(mocks.sheet).toHaveBeenCalledTimes(verdict === "paywalled" ? 1 : 0);
  });

  it("reports a later pass at a placement it blocked", async () => {
    mocks.access = { kind: "free", ...free };
    const { result, rerender } = gateWithAccess("make_plan");
    await act(() => result.current.admit());
    mocks.access = PRO;
    rerender();
    act(() => result.current.passed());
    expect(resumed()[0]?.[1]).toMatchObject({ placement: "make_plan" });
  });
});

it("never reports a pass at another placement as resumed", async () => {
  const removal = gate("remove_place");
  const visit = gate("mark_visited");
  await act(() => removal.current.denied(PRO_REQUIRED));
  act(() => visit.current.passed());
  expect(resumed()).toEqual([]);
});
