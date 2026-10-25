import { describe, expect, it, vi } from "vitest";
import type { Id } from "@convex/_generated/dataModel";
import {
  canMakePlan,
  daysLeft,
  linkForPlan,
  PLAN_SHARE_URL,
  placeLabel,
  planShareText,
  planVoteUrl,
  deckOrder,
  spinSteps,
  votesFor,
  type PlanPlace,
} from "./make-plan";

vi.mock("convex/react", () => ({ useAction: vi.fn(), useMutation: vi.fn() }));
vi.mock("react-native", () => ({ Alert: { alert: vi.fn() }, Share: {} }));
vi.mock("@convex/_generated/api", () => ({ api: {} }));
vi.mock("@/lib/analytics", () => ({
  analytics: { capture: vi.fn(), captureError: vi.fn() },
}));

function place(name: string, area?: string): PlanPlace {
  return {
    name,
    ...(area ? { area } : {}),
    why: `Why ${name}`,
    itemId: "item" as Id<"items">,
  };
}

describe("placeLabel", () => {
  it("adds the area when there is one", () => {
    expect(placeLabel(place("Balthazar", "SoHo"))).toBe("Balthazar, SoHo");
    expect(placeLabel(place("Bar Lola"))).toBe("Bar Lola");
  });
});

describe("planShareText", () => {
  it("lists every place in order, the pick, and the link", () => {
    const places = [place("Balthazar", "SoHo"), place("Bar Lola")];
    const text = planShareText("Date night", places, places[1]);

    expect(text).toBe(
      [
        "Our shortlist from Date night:",
        "",
        "1. Balthazar, SoHo: Why Balthazar",
        "2. Bar Lola: Why Bar Lola",
        "",
        "Tonight: Bar Lola",
        "",
        `Made with Shelvr ${PLAN_SHARE_URL}`,
      ].join("\n"),
    );
  });

  it("leaves the pick out until there is one", () => {
    expect(
      planShareText("Date night", [place("Balthazar")], null),
    ).not.toContain("Tonight");
  });
});

describe("spinSteps", () => {
  it("laps the list, ends on the winner and slows down", () => {
    const steps = spinSteps(5, 3);

    expect(steps).toHaveLength(5 * 2 + 4);
    expect(steps.at(-1)?.index).toBe(3);
    expect(steps.every((step) => step.index >= 0 && step.index < 5)).toBe(true);
    for (let i = 1; i < steps.length; i++) {
      expect(steps[i].holdMs).toBeGreaterThanOrEqual(steps[i - 1].holdMs);
    }
  });

  it("is empty with nothing to pick", () => {
    expect(spinSteps(0, 0)).toEqual([]);
  });
});

describe("canMakePlan", () => {
  const maps = [{ kind: "open_maps" }];
  const ready = { status: "ready" };

  it("needs three ready saves and one with a place", () => {
    expect(canMakePlan([{ ...ready, intents: maps }, ready, ready])).toBe(true);
    expect(canMakePlan([{ ...ready, intents: maps }, ready])).toBe(false);
    expect(canMakePlan([ready, ready, ready])).toBe(false);
    expect(
      canMakePlan([
        { ...ready, intents: maps },
        ready,
        { status: "processing" },
      ]),
    ).toBe(false);
  });

  it("counts a place steered for this space", () => {
    expect(canMakePlan([{ ...ready, spaceIntents: maps }, ready, ready])).toBe(
      true,
    );
  });
});

describe("deckOrder", () => {
  it("draws up to four cards, back to front, ending on the top card", () => {
    expect(deckOrder(5, 0)).toEqual([3, 2, 1, 0]);
    expect(deckOrder(5, 3)).toEqual([1, 0, 4, 3]);
  });

  it("draws every card of a short deck once", () => {
    expect(deckOrder(2, 1)).toEqual([0, 1]);
    expect(deckOrder(0, 0)).toEqual([]);
  });
});

describe("votesFor", () => {
  const votes = {
    voters: 2,
    expiresAt: 0,
    places: [
      { name: "Tigre", picks: 2, passes: 0 },
      { name: "Sweet Linda", picks: 0, passes: 0 },
    ],
  };

  it("finds a place's tally however it is spelled, and only when someone voted", () => {
    expect(votesFor(votes, place("TIGRE "))).toEqual({ picks: 2, passes: 0 });
    expect(votesFor(votes, place("Sweet Linda"))).toBeNull();
    expect(votesFor(votes, place("Nowhere"))).toBeNull();
    expect(votesFor(null, place("Tigre"))).toBeNull();
  });
});

describe("planVoteUrl and daysLeft", () => {
  it("routes development votes to the web app using the same backend", () => {
    vi.stubEnv("EXPO_PUBLIC_WEB_URL", "http://localhost:3000");
    try {
      expect(planVoteUrl("k8Q2")).toBe("http://localhost:3000/p/k8Q2");
    } finally {
      vi.unstubAllEnvs();
    }
  });
  it("builds the vote page and counts whole days, never below one", () => {
    expect(planVoteUrl("k8Q2")).toBe("https://shelvr-web.vercel.app/p/k8Q2");
    const day = 24 * 60 * 60 * 1000;
    expect(daysLeft(6.2 * day, 0)).toBe(7);
    expect(daysLeft(1000, 0)).toBe(1);
    expect(daysLeft(-day, 0)).toBe(1);
  });
});

describe("linkForPlan", () => {
  const link = {
    token: "t",
    expiresAt: Date.now() + 60_000,
    places: [{ name: "Tigre" }, { name: "Sweet Linda" }],
  };

  it("keeps the link only while it holds the shortlist on screen", () => {
    expect(linkForPlan(link, [place("sweet linda"), place("TIGRE")])).toBe(
      link,
    );
    expect(linkForPlan(link, [place("Tigre")])).toBeNull();
    expect(linkForPlan(link, [place("Tigre"), place("Bastian")])).toBeNull();
    expect(linkForPlan(link, [])).toBeNull();
    expect(linkForPlan(null, [place("Tigre")])).toBeNull();
  });

  it("drops a link once its week is over", () => {
    const shortlist = [place("Tigre"), place("Sweet Linda")];
    expect(linkForPlan(link, shortlist, link.expiresAt)).toBeNull();
    expect(linkForPlan(link, shortlist, link.expiresAt - 1)).toBe(link);
  });
});
