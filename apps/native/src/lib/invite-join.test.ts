import { describe, expect, it, vi } from "vitest";
import type { Id } from "@convex/_generated/dataModel";
import { inviteJoinOutcome, inviteJoinStep } from "./invite-join";

vi.mock("@/lib/analytics", () => ({ analytics: {} }));
vi.mock("@/lib/onboarding", () => ({ useOnboarding: () => ({}) }));
vi.mock("@/lib/onboarding-exit", () => ({ holdIncomingShare: () => {} }));
vi.mock("@/lib/pending-onboarding", () => ({ clearPending: () => {} }));
vi.mock("@/lib/pending-invite", () => ({}));
vi.mock("@convex/_generated/api", () => ({ api: { sharedLists: {} } }));
vi.mock("convex/react", () => ({}));
vi.mock("expo-router", () => ({}));

const settled = { isLoading: false, isAuthenticated: true, inFlight: null };

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
      clearToken: true,
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
      clearToken: true,
      completeOnboarding: false,
      href: "/list-invite/a%20b",
    });
  });
});
