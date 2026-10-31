// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Id } from "@convex/_generated/dataModel";
import {
  inviteJoinOutcome,
  inviteJoinStep,
  useInviteJoinCoordinator,
} from "./invite-join";

const mocks = vi.hoisted(() => ({
  onboarded: true,
  join: vi.fn(),
  alert: vi.fn(),
  capture: vi.fn(),
  captureError: vi.fn(),
  completeOnboarding: vi.fn(),
  holdIncomingShare: vi.fn(),
  clearPending: vi.fn(),
  clearPendingInvite: vi.fn(),
  router: { replace: vi.fn() },
}));

vi.mock("@/lib/analytics", () => ({
  analytics: { capture: mocks.capture, captureError: mocks.captureError },
}));
vi.mock("@/lib/i18n", () => ({ t: (key: string) => key }));
vi.mock("react-native", () => ({ Alert: { alert: mocks.alert } }));
vi.mock("@/lib/onboarding", () => ({
  useOnboarding: () => ({
    onboarded: mocks.onboarded,
    completeOnboarding: mocks.completeOnboarding,
  }),
}));
vi.mock("@/lib/onboarding-exit", () => ({
  holdIncomingShare: mocks.holdIncomingShare,
}));
vi.mock("@/lib/pending-onboarding", () => ({
  clearPending: mocks.clearPending,
}));
vi.mock("@/lib/pending-invite", () => ({
  clearPendingInvite: mocks.clearPendingInvite,
  getPendingInvite: () => "abc",
  subscribePendingInvite: () => () => {},
}));
vi.mock("@convex/_generated/api", () => ({
  api: { sharedLists: { joinSharedList: "joinSharedList" } },
}));
vi.mock("convex/react", () => ({
  useConvexAuth: () => ({ isLoading: false, isAuthenticated: true }),
  useMutation: () => mocks.join,
}));
vi.mock("expo-router", () => ({ useRouter: () => mocks.router }));

const settled = { isLoading: false, isAuthenticated: true, inFlight: null };

describe("useInviteJoinCoordinator", () => {
  async function joinWith(onboarded: boolean, listId: string | null | Error) {
    mocks.onboarded = onboarded;
    if (listId instanceof Error) mocks.join.mockRejectedValue(listId);
    else mocks.join.mockResolvedValue(listId);
    renderHook(() => useInviteJoinCoordinator());
    await act(async () => {});
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keeps a queued reel when an onboarded person joins from the paywall", async () => {
    await joinWith(true, "list1");
    expect(mocks.clearPending).not.toHaveBeenCalled();
    expect(mocks.router.replace).toHaveBeenCalledWith("/shared-list/list1");
  });

  it("keeps onboarding's answers when the invite is dead", async () => {
    await joinWith(false, null);
    expect(mocks.clearPending).not.toHaveBeenCalled();
    expect(mocks.completeOnboarding).not.toHaveBeenCalled();
  });

  it("keeps onboarding's answers when the join fails", async () => {
    await joinWith(false, new Error("list full"));
    expect(mocks.clearPending).not.toHaveBeenCalled();
    expect(mocks.alert).toHaveBeenCalledWith("sharedLists.joinFailed");
  });

  it("drops onboarding's queue before finishing onboarding for a person who joined", async () => {
    await joinWith(false, "list1");
    const [cleared] = mocks.clearPending.mock.invocationCallOrder;
    const [completed] = mocks.completeOnboarding.mock.invocationCallOrder;
    expect(cleared).toBeLessThan(completed!);
  });
});

describe("inviteJoinStep", () => {
  it("waits with no token", () => {
    expect(inviteJoinStep({ ...settled, token: null })).toEqual({
      kind: "wait",
    });
  });

  it("waits while auth is loading or signed out, keeping the token", () => {
    expect(
      inviteJoinStep({ ...settled, token: "abc", isLoading: true }),
    ).toEqual({ kind: "wait" });
    expect(
      inviteJoinStep({ ...settled, token: "abc", isAuthenticated: false }),
    ).toEqual({ kind: "wait" });
  });

  it("joins once signed in", () => {
    expect(inviteJoinStep({ ...settled, token: "abc" })).toEqual({
      kind: "join",
      token: "abc",
    });
  });

  it("sends the same token only once while a call is in flight", () => {
    expect(
      inviteJoinStep({ ...settled, token: "abc", inFlight: "abc" }),
    ).toEqual({ kind: "wait" });
    expect(
      inviteJoinStep({ ...settled, token: "other", inFlight: "abc" }),
    ).toEqual({ kind: "join", token: "other" });
  });
});

describe("inviteJoinOutcome", () => {
  const listId = "list1" as Id<"sharedLists">;

  it("opens the list and spends the token", () => {
    expect(inviteJoinOutcome(listId, "abc", true)).toEqual({
      completeOnboarding: false,
      href: "/shared-list/list1",
    });
  });

  it("completes onboarding for a person who joined before finishing it", () => {
    expect(inviteJoinOutcome(listId, "abc", false).completeOnboarding).toBe(
      true,
    );
  });

  it("shows the dead state for an invite that no longer works", () => {
    expect(inviteJoinOutcome(null, "a b", true)).toEqual({
      completeOnboarding: false,
      href: "/list-invite/a%20b",
    });
  });

  it("leaves onboarding open when the invite died before the join", () => {
    expect(inviteJoinOutcome(null, "abc", false).completeOnboarding).toBe(
      false,
    );
  });
});
