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
import { planCities } from "@/lib/sample-plans";

vi.mock("expo-localization", () => ({
  getLocales: () => [{ languageTag: "en-US" }],
}));
vi.mock("@/lib/analytics", () => ({ analytics: { capture: vi.fn() } }));
vi.mock("@/lib/revenuecat-module", () => ({ getPurchases: () => null }));
vi.mock("expo-secure-store", () => ({ getItem: vi.fn(), setItem: vi.fn() }));

type Progress = Parameters<typeof goalPaywallVariables>[0];
const progress = (
  goal: Goal | null,
  travelCity: Progress["travelCity"] = null,
): Progress => ({ goals: goal === null ? [] : [goal], travelCity });
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
      goal_headline: "Plan Lisbon from your saves.",
      goal_subline: "Turn saved places into a day-by-day trip.",
      goal_photo_tag: "Your sample trip",
      goal_answer_1: "Trips",
      goal_answer_2: "Lisbon",
      goal_today: "Your Lisbon saves become a day-by-day plan.",
      goal_plan_title: "Plan Lisbon from your saves",
      goal_benefit_title: "Build a trip from your saves",
      goal_benefit_body: "Saved places become a day-by-day plan.",
    });
    expect(values(progress("travel"))).toMatchObject({
      goal_city: "",
      goal_headline: "Plan your next trip from your saves.",
      goal_answer_2: "",
      goal_today: "Your saves become a day-by-day plan.",
      goal_plan_title: "Plan your next trip from your saves",
    });
  });

  it("covers food with and without a city", () => {
    expect(values(progress("food", "paris"))).toMatchObject({
      goal: "food",
      goal_headline: "Know where to eat next.",
      goal_photo_tag: "Your sample places",
      goal_answer_1: "Places to eat",
      goal_answer_2: "Paris",
      goal_today: "Your Paris spots, narrowed to this weekend.",
      goal_plan_title: "Know where to eat next",
      goal_benefit_title: "Choose somewhere to eat",
    });
    expect(values(progress("food"))).toMatchObject({
      goal_headline: "Know where to eat next.",
      goal_answer_2: "",
      goal_today: "Your spots, narrowed to this weekend.",
      goal_plan_title: "Know where to eat next",
      goal_benefit_body: "A few of your saved spots, picked for this weekend.",
    });
  });

  it("covers date with and without a city", () => {
    expect(values(progress("date", "london"))).toMatchObject({
      goal_headline: "Make date night easy.",
      goal_photo_tag: "Your sample date night",
      goal_answer_1: "Date nights",
      goal_answer_2: "London",
      goal_today: "Your saved spots become a whole evening.",
      goal_plan_title: "Make date night easy",
      goal_benefit_title: "Pick your next date-night spot",
    });
    expect(values(progress("date")).goal_answer_2).toBe("");
  });

  it("words the paywall for the goal that leads when several were picked", () => {
    expect(
      values({ goals: ["food", "travel", "date"], travelCity: "paris" }),
    ).toMatchObject({ goal: "date", goal_city: "paris" });
    expect(values({ goals: ["food", "travel"], travelCity: null }).goal).toBe(
      "travel",
    );
  });

  it("keeps the goal id unlocalized for every goal", () => {
    for (const goal of GOALS) {
      expect(goalPaywallVariables(progress(goal)).goal).toEqual({
        type: "string",
        value: goal,
      });
    }
  });

  it("offers only trip cities the goal paywall has a photo for", () => {
    expect(
      planCities("trip"),
      "A new trip city needs its own 'Goal photo travel <City>' layer in the RevenueCat goal paywall's Travel photos group, or travel users who pick it see Prague",
    ).toEqual([
      "amsterdam",
      "austin",
      "barcelona",
      "berlin",
      "chicago",
      "copenhagen",
      "dallas",
      "florence",
      "las-vegas",
      "lisbon",
      "london",
      "los-angeles",
      "madrid",
      "milan",
      "montreal",
      "new-york",
      "paris",
      "prague",
      "rome",
      "san-francisco",
      "seoul",
      "tokyo",
      "toronto",
      "vancouver",
    ]);
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
      progress("food"),
    );
    expect(variables).toMatchObject({
      trial_end_day: { type: "string", value: "7" },
      goal: { type: "string", value: "food" },
      goal_city: { type: "string", value: "" },
    });
    expect(
      paywallVariables(0, undefined, [], undefined, progress("food")),
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

  it("has the 33 keys in every locale", () => {
    expect(keys).toHaveLength(33);
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
