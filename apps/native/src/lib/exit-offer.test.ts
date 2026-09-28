import { describe, expect, it, vi } from "vitest";

import {
  EXIT_OFFER_COOLDOWN_MS,
  EXIT_OFFERING_ID,
  exitOfferDue,
  findExitOffering,
  parseShownAt,
} from "./exit-offer";

const ELIGIBLE = 2;
const INELIGIBLE = 1;

const offering = (introPrice: unknown = { price: 19.99 }) => ({
  identifier: EXIT_OFFERING_ID,
  availablePackages: [{ product: { identifier: "annual_exit", introPrice } }],
});

describe("exitOfferDue", () => {
  const now = 1_000_000_000_000;

  it("offers when it has never been shown", () => {
    expect(exitOfferDue("onboarding", null, now)).toBe(true);
  });

  it("waits a week between offers", () => {
    expect(
      exitOfferDue("home_card", now - EXIT_OFFER_COOLDOWN_MS + 1, now),
    ).toBe(false);
    expect(exitOfferDue("home_card", now - EXIT_OFFER_COOLDOWN_MS, now)).toBe(
      true,
    );
  });

  it("never follows the retry screen", () => {
    expect(exitOfferDue("retry", null, now)).toBe(false);
  });
});

describe("parseShownAt", () => {
  it("reads a stored timestamp", () => {
    expect(parseShownAt("1700000000000")).toBe(1_700_000_000_000);
  });

  it("treats missing or garbled values as never shown", () => {
    expect(parseShownAt(null)).toBeNull();
    expect(parseShownAt("")).toBeNull();
    expect(parseShownAt("soon")).toBeNull();
  });
});

describe("findExitOffering", () => {
  const deps = (
    all: Record<string, ReturnType<typeof offering>>,
    status = ELIGIBLE,
  ) => ({
    getOfferings: vi.fn(async () => ({ all })),
    checkEligibility: vi.fn(async (ids: string[]) =>
      Object.fromEntries(ids.map((id) => [id, { status }])),
    ),
  });

  it("returns the offering when the discount applies", async () => {
    const exit = offering();
    const d = deps({ [EXIT_OFFERING_ID]: exit });
    await expect(findExitOffering(d)).resolves.toBe(exit);
    expect(d.checkEligibility).toHaveBeenCalledWith(["annual_exit"]);
  });

  it("requires every discounted package to qualify", async () => {
    const exit = {
      identifier: EXIT_OFFERING_ID,
      availablePackages: [
        {
          product: { identifier: "annual_exit", introPrice: { price: 19.99 } },
        },
        { product: { identifier: "other", introPrice: { price: 1 } } },
      ],
    };
    const d = {
      getOfferings: async () => ({ all: { [EXIT_OFFERING_ID]: exit } }),
      checkEligibility: async () => ({
        annual_exit: { status: INELIGIBLE },
        other: { status: ELIGIBLE },
      }),
    };
    await expect(findExitOffering(d)).resolves.toBeNull();
  });

  it("does nothing until the offering exists in RevenueCat", async () => {
    await expect(findExitOffering(deps({}))).resolves.toBeNull();
  });

  it("skips someone who already used an introductory offer", async () => {
    const d = deps({ [EXIT_OFFERING_ID]: offering() }, INELIGIBLE);
    await expect(findExitOffering(d)).resolves.toBeNull();
  });

  it("skips an offering whose product has no introductory price", async () => {
    const d = deps({ [EXIT_OFFERING_ID]: offering(null) });
    await expect(findExitOffering(d)).resolves.toBeNull();
    expect(d.checkEligibility).not.toHaveBeenCalled();
  });

  it("treats a RevenueCat error as no offer", async () => {
    await expect(
      findExitOffering({
        getOfferings: async () => {
          throw new Error("network");
        },
        checkEligibility: async () => ({}),
      }),
    ).resolves.toBeNull();
  });
});
