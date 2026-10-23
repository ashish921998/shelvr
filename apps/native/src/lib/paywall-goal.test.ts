import { describe, expect, it, vi } from "vitest";
import de from "@/locales/de.json";
import en from "@/locales/en.json";
import esMX from "@/locales/es-MX.json";
import es from "@/locales/es.json";
import frCA from "@/locales/fr-CA.json";
import fr from "@/locales/fr.json";
import ja from "@/locales/ja.json";
import ko from "@/locales/ko.json";
import ptBR from "@/locales/pt-BR.json";
import { GOALS, type Goal } from "@/lib/onboarding-goals";
import { goalPaywallVariables } from "@/lib/paywall-goal";
import { paywallVariables } from "@/lib/paywall-funnel";

vi.mock("expo-localization", () => ({
  getLocales: () => [{ languageTag: "en-US" }],
}));
vi.mock("@/lib/pending-onboarding", () => ({
  resolveOnboardingSpaceName: (id: string) => id,
}));
vi.mock("@/lib/analytics", () => ({ analytics: { capture: vi.fn() } }));
vi.mock("@/lib/revenuecat-module", () => ({ getPurchases: () => null }));

type Progress = Parameters<typeof goalPaywallVariables>[0];
const progress = (
  goal: Goal | null,
  travelCity: Progress["travelCity"] = null,
  spaces: string[] = [],
): Progress => ({ goal, travelCity, spaces });
const values = (p: Progress) =>
  Object.fromEntries(
    Object.entries(goalPaywallVariables(p)).map(([k, v]) => [k, v.value]),
  );

describe("goalPaywallVariables", () => {
  it("returns nothing without a goal", () => {
    expect(goalPaywallVariables(progress(null, "lisbon"))).toEqual({});
  });

  it("names the city in travel copy, and reads without it when none was picked", () => {
    expect(values(progress("travel", "lisbon"))).toEqual({
      goal: "travel",
      goal_city: "lisbon",
      goal_headline: "Let’s plan Lisbon\nfrom your saves.",
      goal_subline: "Every place you save, on one map, day by day.",
      goal_photo_tag: "Your sample trip",
      goal_answer_1: "Travel ideas",
      goal_answer_2: "Next trip: Lisbon",
      goal_today: "Your Lisbon saves become a day-by-day plan.",
      goal_plan_title: "Plan Lisbon from your saves",
      goal_benefit_title: "Trips from your saves",
      goal_benefit_body: "Saved places become a day-by-day plan.",
    });
    expect(values(progress("travel"))).toMatchObject({
      goal_city: "",
      goal_headline: "Let’s plan your next trip\nfrom your saves.",
      goal_answer_2: "",
      goal_today: "Your saves become a day-by-day plan.",
      goal_plan_title: "Plan your next trip from your saves",
    });
  });

  it("covers food with and without a city", () => {
    expect(values(progress("food", "paris"))).toMatchObject({
      goal: "food",
      goal_headline: "Let’s find your next\nParis favorite.",
      goal_photo_tag: "Your sample weekend",
      goal_answer_1: "Food places",
      goal_answer_2: "Lives in Paris",
      goal_today: "Your Paris spots, narrowed to this weekend.",
      goal_plan_title: "Know where to eat in Paris",
      goal_benefit_title: "Weekend shortlists",
    });
    expect(values(progress("food"))).toMatchObject({
      goal_headline: "Let’s find your next\nfavorite spot.",
      goal_answer_2: "",
      goal_today: "Your spots, narrowed to this weekend.",
      goal_plan_title: "Know where to eat this weekend",
      goal_benefit_body: "A few of your saved spots, picked for this weekend.",
    });
  });

  it("covers date with and without a city", () => {
    expect(values(progress("date", "london"))).toMatchObject({
      goal_headline: "Let’s make date night\nthe easy part.",
      goal_photo_tag: "Your sample date night",
      goal_answer_1: "Date-night spots",
      goal_answer_2: "Lives in London",
      goal_today: "Your saved spots become a whole evening.",
      goal_plan_title: "Plan a whole evening from your saves",
      goal_benefit_title: "A whole evening",
    });
    expect(values(progress("date")).goal_answer_2).toBe("");
  });

  it("writes recipes out, with no second answer", () => {
    expect(values(progress("recipes", "rome"))).toEqual({
      goal: "recipes",
      goal_city: "rome",
      goal_headline: "Let’s get dinner\nout of your saves.",
      goal_subline: "Every recipe written out, even from a video.",
      goal_photo_tag: "Your sample recipe",
      goal_answer_1: "Recipes",
      goal_answer_2: "",
      goal_today: "Every recipe you save, written out.",
      goal_plan_title: "Cook it without rewatching the video",
      goal_benefit_title: "Recipes, written out",
      goal_benefit_body:
        "Ingredients and steps, even when the caption has none.",
    });
  });

  it("lists the first two picked interests for other", () => {
    expect(values(progress("other", null, ["Gear", "Books", "Art"]))).toEqual({
      goal: "other",
      goal_city: "",
      goal_headline: "Let’s make your saves\nworth keeping.",
      goal_subline: "Find anything again by what you remember.",
      goal_photo_tag: "Your first save",
      goal_answer_1: "Products and articles",
      goal_answer_2: "Gear, Books",
      goal_today: "A space for each thing you’re into.",
      goal_plan_title: "Find it when you need it",
      goal_benefit_title: "A space for each interest",
      goal_benefit_body: "Sorted into your spaces as you save.",
    });
    expect(values(progress("other")).goal_answer_2).toBe("");
  });

  it("keeps the goal id unlocalized for every goal", () => {
    for (const goal of GOALS) {
      expect(goalPaywallVariables(progress(goal)).goal).toEqual({
        type: "string",
        value: goal,
      });
    }
  });
});

describe("paywallVariables", () => {
  it("stays undefined when nothing applies, even with onboarding progress but no goal", () => {
    expect(paywallVariables(0, undefined, [], undefined)).toBeUndefined();
    expect(
      paywallVariables(0, undefined, [], undefined, progress(null)),
    ).toBeUndefined();
  });

  it("adds goal variables alongside trial ones", () => {
    const variables = paywallVariables(
      0,
      { unit: "DAY", count: 7 },
      [],
      undefined,
      progress("recipes"),
    );
    expect(variables).toMatchObject({
      trial_end_day: { type: "string", value: "7" },
      goal: { type: "string", value: "recipes" },
    });
    expect(
      paywallVariables(0, undefined, [], undefined, progress("recipes")),
    ).toHaveProperty("goal_headline");
  });
});

describe("paywallGoal catalog copy", () => {
  const catalogs = {
    en,
    de,
    es,
    "es-MX": esMX,
    fr,
    "fr-CA": frCA,
    ja,
    ko,
    "pt-BR": ptBR,
  };
  const free: Record<string, RegExp> = {
    en: /free/i,
    de: /kostenlos|gratis/i,
    es: /gratis|gratuit/i,
    "es-MX": /gratis|gratuit/i,
    fr: /gratuit/i,
    "fr-CA": /gratuit/i,
    ja: /無料/,
    ko: /무료/,
    "pt-BR": /grátis|gratuit/i,
  };
  const keys = Object.keys(en).filter((key) => key.startsWith("paywallGoal."));

  it("has the 49 keys in every locale", () => {
    expect(keys).toHaveLength(49);
    for (const [locale, catalog] of Object.entries(catalogs)) {
      const own = Object.keys(catalog).filter((key) =>
        key.startsWith("paywallGoal."),
      );
      expect(own, locale).toEqual(keys);
    }
  });

  it("uses no dash and never says free", () => {
    for (const [locale, catalog] of Object.entries(catalogs)) {
      for (const key of keys) {
        const value = (catalog as unknown as Record<string, string>)[key];
        expect(value, `${locale} ${key}`).not.toMatch(/[—–]/);
        expect(value, `${locale} ${key}`).not.toMatch(free[locale]);
      }
    }
  });
});
