import { describe, expect, it } from "vitest";
import {
  addDays,
  addMonths,
  annualTrialOffered,
  formatMoney,
  initialPaywallState,
  paywallReducer,
  perMonth,
  planCopy,
  savePct,
  SLIDE_COUNT,
  type PaywallState,
} from "./paywall-plans";

describe("pricing math", () => {
  it("matches the design's numbers", () => {
    expect(perMonth(29.99)).toBeCloseTo(2.4992, 4);
    expect(formatMoney(perMonth(29.99), "USD", "en-US")).toBe("$2.50");
    expect(savePct(29.99, 4.99)).toBe(50);
  });

  it("follows the live prices", () => {
    expect(formatMoney(perMonth(39.99), "USD", "en-US")).toBe("$3.33");
    expect(savePct(39.99, 4.99)).toBe(33);
  });

  it("claims no saving when a year isn't cheaper", () => {
    expect(savePct(59.88, 4.99)).toBeNull();
    expect(savePct(70, 4.99)).toBeNull();
    expect(savePct(0, 4.99)).toBeNull();
    expect(savePct(29.99, 0)).toBeNull();
    expect(savePct(Number.NaN, 4.99)).toBeNull();
  });

  it("formats in the store's currency and the user's locale", () => {
    expect(formatMoney(3.33, "EUR", "de-DE")).toMatch(/^3,33\s€$/);
    expect(formatMoney(333, "JPY", "ja-JP")).toMatch(/333/);
  });

  it("still shows a price for a currency Intl rejects", () => {
    expect(formatMoney(2.5, "not-a-currency", "en-US")).toBe(
      "not-a-currency 2.50",
    );
  });
});

describe("annualTrialOffered", () => {
  const trial = { price: 0, periodUnit: "DAY", periodNumberOfUnits: 7 };

  it("needs a free introductory phase", () => {
    expect(annualTrialOffered({ introPrice: null, platform: "android" })).toBe(
      false,
    );
    expect(
      annualTrialOffered({ introPrice: { price: 0.99 }, platform: "android" }),
    ).toBe(false);
    expect(annualTrialOffered({ introPrice: trial, platform: "android" })).toBe(
      true,
    );
  });

  it("needs the free phase to last exactly seven days", () => {
    const android = (periodUnit: string, periodNumberOfUnits: number) =>
      annualTrialOffered({
        introPrice: { price: 0, periodUnit, periodNumberOfUnits },
        platform: "android",
      });
    expect(android("WEEK", 1)).toBe(true);
    expect(android("DAY", 3)).toBe(false);
    expect(android("DAY", 14)).toBe(false);
    expect(android("MONTH", 1)).toBe(false);
    expect(
      annualTrialOffered({ introPrice: { price: 0 }, platform: "android" }),
    ).toBe(false);
  });

  it("needs RevenueCat to confirm eligibility on iOS", () => {
    const ios = (iosEligibility?: number) =>
      annualTrialOffered({
        introPrice: trial,
        platform: "ios",
        iosEligibility,
      });
    expect(ios(2)).toBe(true);
    expect(ios(1)).toBe(false);
    // Unknown is treated as no trial, so the page never promises one the
    // store won't give.
    expect(ios(0)).toBe(false);
    expect(ios(undefined)).toBe(false);
  });
});

describe("dates", () => {
  it("adds calendar days", () => {
    const start = new Date(2026, 9, 2, 9, 30).getTime();
    expect(new Date(addDays(start, 5)).getDate()).toBe(7);
    expect(new Date(addDays(start, 7)).getDate()).toBe(9);
    expect(new Date(addDays(start, 7)).getHours()).toBe(9);
  });

  it("adds months without overflowing short months", () => {
    const jan31 = new Date(2026, 0, 31).getTime();
    const feb = new Date(addMonths(jan31, 1));
    expect([feb.getMonth(), feb.getDate()]).toEqual([1, 28]);
    const oct2 = new Date(2026, 9, 2).getTime();
    const nov = new Date(addMonths(oct2, 1));
    expect([nov.getMonth(), nov.getDate()]).toEqual([10, 2]);
    const next = new Date(addMonths(oct2, 12));
    expect([next.getFullYear(), next.getMonth()]).toEqual([2027, 9]);
  });
});

describe("paywallReducer", () => {
  const run = (...actions: Parameters<typeof paywallReducer>[1][]) =>
    actions.reduce(paywallReducer, initialPaywallState);

  it("starts on the carousel with annual selected", () => {
    expect(initialPaywallState).toEqual({
      step: 0,
      slide: 0,
      paused: false,
      plan: "annual",
    });
  });

  it("moves between the two steps", () => {
    expect(run({ type: "continue" }).step).toBe(1);
    expect(run({ type: "continue" }, { type: "continue" }).step).toBe(1);
    expect(run({ type: "continue" }, { type: "back" }).step).toBe(0);
    expect(run({ type: "back" })).toBe(initialPaywallState);
  });

  it("keeps the selected plan across steps", () => {
    const state = run(
      { type: "continue" },
      { type: "selectPlan", plan: "monthly" },
      { type: "back" },
      { type: "continue" },
    );
    expect(state.plan).toBe("monthly");
    expect(run({ type: "selectPlan", plan: "annual" })).toBe(
      initialPaywallState,
    );
  });

  it("autoplays around the slides", () => {
    const states: PaywallState[] = [];
    let state = initialPaywallState;
    for (let i = 0; i < SLIDE_COUNT; i += 1) {
      state = paywallReducer(state, { type: "autoplay" });
      states.push(state);
    }
    expect(states.map((s) => s.slide)).toEqual([1, 2, 3, 0]);
  });

  it("stops autoplay for good once the user picks a slide", () => {
    const state = run({ type: "showSlide", slide: 2 }, { type: "autoplay" });
    expect(state).toMatchObject({ slide: 2, paused: true });
  });

  it("doesn't autoplay behind step 2", () => {
    expect(run({ type: "continue" }, { type: "autoplay" }).slide).toBe(0);
  });

  it("clamps slide indexes from a swipe", () => {
    expect(run({ type: "showSlide", slide: 9 }).slide).toBe(SLIDE_COUNT - 1);
    expect(run({ type: "showSlide", slide: -1 }).slide).toBe(0);
    expect(run({ type: "showSlide", slide: 1.6 }).slide).toBe(2);
    expect(run({ type: "showSlide", slide: Number.NaN }).slide).toBe(0);
  });
});

describe("planCopy", () => {
  const now = new Date(2026, 9, 2, 9).getTime();

  it("annual with a trial walks through the trial", () => {
    const copy = planCopy("annual", true, now);
    expect(copy.ctaKey).toBe("paywall.ctaTrial");
    expect(copy.titleKey).toBe("paywall.planTitleTrial");
    expect(copy.disclosureKey).toBe("paywall.disclosureTrial");
    expect(copy.timeline.map((row) => row.day)).toEqual([undefined, 5, 7]);
    expect(copy.timeline[1].reminder).toBe(true);
    expect(new Date(copy.timeline[1].date!).getDate()).toBe(7);
    expect(new Date(copy.timeline[2].date!).getDate()).toBe(9);
  });

  it("annual without a trial never promises one", () => {
    const copy = planCopy("annual", false, now);
    expect(copy.ctaKey).toBe("paywall.ctaAnnual");
    expect(copy.titleKey).toBe("paywall.planTitle");
    expect(copy.disclosureKey).toBe("paywall.disclosureAnnual");
    expect(copy.timeline.some((row) => row.reminder)).toBe(false);
    expect(copy.timeline[0].headlineKey).toBe("paywall.billedToday");
  });

  it("monthly bills today and offers the annual trial when there is one", () => {
    const copy = planCopy("monthly", true, now);
    // Monthly is charged today, so it never borrows the trial headline.
    expect(copy.titleKey).toBe("paywall.planTitle");
    expect(copy.ctaKey).toBe("paywall.ctaMonthly");
    expect(copy.disclosureKey).toBe("paywall.disclosureMonthly");
    expect(copy.timeline[0].headlineKey).toBe("paywall.billedToday");
    expect(new Date(copy.timeline[1].date!).getMonth()).toBe(10);
    expect(copy.timeline[2].annualChip).toBe(true);
    expect(planCopy("monthly", false, now).timeline[2].annualChip).toBe(false);
  });

  it("never puts 'free' on a button", async () => {
    const en = (await import("@/locales/en.json")).default as unknown as Record<
      string,
      string
    >;
    for (const plan of ["annual", "monthly"] as const) {
      for (const trial of [true, false]) {
        const copy = planCopy(plan, trial, now);
        expect(en[copy.ctaKey]).not.toMatch(/free/i);
      }
    }
    expect(en["paywall.annualChip"]).not.toMatch(/free/i);
    expect(en["paywall.ctaTrial"]).toBe("Start 7-day trial");
    expect(en["paywall.ctaMonthly"]).toBe("Subscribe monthly");
  });
});
