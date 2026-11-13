// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Id } from "@convex/_generated/dataModel";
import {
  inviteJoinOutcome,
  inviteJoinStep,
  listResolution,
  passportResolution,
  useInviteJoinCoordinator,
} from "./invite-join";

const mocks = vi.hoisted(() => ({
  onboarded: true,
  pending: "abc",
  join: vi.fn(),
  query: vi.fn(),
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
  getPendingInvite: () => mocks.pending,
  pendingInviteOf: (raw: string) =>
    raw.startsWith("passport:")
      ? { kind: "passport", token: raw.slice(9) }
      : { kind: "list", token: raw },
  subscribePendingInvite: () => () => {},
}));
vi.mock("@convex/_generated/api", () => ({
  api: {
    sharedLists: { joinSharedList: "joinSharedList" },
    passportShares: { passportPreview: "passportPreview" },
  },
}));
vi.mock("convex/react", () => ({
  useConvex: () => ({ query: mocks.query }),
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
    mocks.pending = "abc";
  });

  async function resumeWith(onboarded: boolean, found: boolean | Error) {
    mocks.pending = "passport:tok1";
    if (found instanceof Error) mocks.query.mockRejectedValue(found);
    else mocks.query.mockResolvedValue(found ? { places: 1 } : null);
    await joinWith(onboarded, "list1");
  }

  it("opens the comparison for a live passport link, finishing onboarding for a new person", async () => {
    await resumeWith(false, true);
    expect(mocks.join).not.toHaveBeenCalled();
    expect(mocks.query).toHaveBeenCalledWith("passportPreview", {
      token: "tok1",
    });
    expect(mocks.clearPendingInvite).toHaveBeenCalled();
    expect(mocks.completeOnboarding).toHaveBeenCalled();
    expect(mocks.router.replace).toHaveBeenCalledWith(
      "/passport-invite/tok1?compare=1",
    );
  });

  it("opens the comparison without touching onboarding for an onboarded person", async () => {
    await resumeWith(true, true);
    expect(mocks.completeOnboarding).not.toHaveBeenCalled();
    expect(mocks.clearPending).not.toHaveBeenCalled();
    expect(mocks.router.replace).toHaveBeenCalledWith(
      "/passport-invite/tok1?compare=1",
    );
  });

  it("keeps onboarding when the passport link died during sign-in", async () => {
    await resumeWith(false, false);
    expect(mocks.completeOnboarding).not.toHaveBeenCalled();
    expect(mocks.clearPending).not.toHaveBeenCalled();
    expect(mocks.clearPendingInvite).toHaveBeenCalled();
    expect(mocks.router.replace).toHaveBeenCalledWith("/passport-invite/tok1");
  });

  it("keeps onboarding and reports it when the passport check fails", async () => {
    await resumeWith(false, new Error("offline"));
    expect(mocks.completeOnboarding).not.toHaveBeenCalled();
    expect(mocks.captureError).toHaveBeenCalledWith(
      "passport_resume_failed",
      expect.any(Error),
    );
  });

  it("keeps a queued reel when an onboarded person joins from the paywall", async () => {
    await joinWith(true, "list1");
    expect(mocks.clearPending).not.toHaveBeenCalled();
    expect(mocks.router.replace).toHaveBeenCalledWith(
      "/shared-list/list1?joined=1",
    );
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

  it("decodes the held invite once signed in", () => {
    expect(inviteJoinStep({ ...settled, token: "abc" })).toEqual({
      kind: "list",
      token: "abc",
      raw: "abc",
    });
    expect(inviteJoinStep({ ...settled, token: "passport:p1" })).toEqual({
      kind: "passport",
      token: "p1",
      raw: "passport:p1",
    });
  });

  it("sends the same token only once while a call is in flight", () => {
    expect(
      inviteJoinStep({ ...settled, token: "abc", inFlight: "abc" }),
    ).toEqual({ kind: "wait" });
    expect(
      inviteJoinStep({ ...settled, token: "other", inFlight: "abc" }),
    ).toEqual({ kind: "list", token: "other", raw: "other" });
  });
});

describe("inviteJoinOutcome", () => {
  const listId = "list1" as Id<"sharedLists">;

  it("opens the list and spends the token", () => {
    expect(inviteJoinOutcome(listResolution(listId, "abc"), true)).toEqual({
      completeOnboarding: false,
      href: "/shared-list/list1?joined=1",
    });
  });

  it("completes onboarding only for a live invite", () => {
    expect(
      inviteJoinOutcome(listResolution(listId, "abc"), false)
        .completeOnboarding,
    ).toBe(true);
    expect(
      inviteJoinOutcome(passportResolution(true, "abc"), false)
        .completeOnboarding,
    ).toBe(true);
    expect(
      inviteJoinOutcome(listResolution(null, "abc"), false).completeOnboarding,
    ).toBe(false);
    expect(
      inviteJoinOutcome(passportResolution(false, "abc"), false)
        .completeOnboarding,
    ).toBe(false);
  });

  it("shows the dead state for an invite that no longer works", () => {
    expect(inviteJoinOutcome(listResolution(null, "a b"), true)).toEqual({
      completeOnboarding: false,
      href: "/list-invite/a%20b",
    });
    expect(inviteJoinOutcome(passportResolution(false, "a b"), true)).toEqual({
      completeOnboarding: false,
      href: "/passport-invite/a%20b",
    });
  });
});
