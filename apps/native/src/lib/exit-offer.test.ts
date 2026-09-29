import { describe, expect, it, vi } from "vitest";

import {
  EXIT_OFFER_COOLDOWN_MS,
  EXIT_OFFER_WINDOW_MS,
  EXIT_OFFERING_ID,
  exitOfferDue,
  exitOfferEndsAt,
  exitOfferReminderAt,
  exitOfferReminderPending,
  exitOfferReminderPlan,
  findExitOffering,
  formatCountdown,
  parseShownAt,
  timeLeft,
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

  it("waits a month between offers", () => {
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

describe("exitOfferEndsAt", () => {
  const shownAt = 1_000_000_000_000;

  it("keeps the offer open for its window", () => {
    expect(exitOfferEndsAt(shownAt, shownAt)).toBe(
      shownAt + EXIT_OFFER_WINDOW_MS,
    );
    expect(exitOfferEndsAt(shownAt, shownAt + EXIT_OFFER_WINDOW_MS - 1)).toBe(
      shownAt + EXIT_OFFER_WINDOW_MS,
    );
  });

  it("closes the offer at the deadline", () => {
    expect(exitOfferEndsAt(shownAt, shownAt + EXIT_OFFER_WINDOW_MS)).toBeNull();
    expect(exitOfferEndsAt(null, shownAt)).toBeNull();
  });

  it("never reopens an expired offer before the cooldown", () => {
    const expired = shownAt + EXIT_OFFER_WINDOW_MS;
    expect(exitOfferDue("home_card", shownAt, expired)).toBe(false);
  });
});

describe("reminder controls", () => {
  const endsAt = 1_000_000_000_000;
  const HOUR = 60 * 60 * 1000;

  it("keeps cancelling possible after scheduling a new reminder is too late", () => {
    const now = endsAt - HOUR - 60_000; // 1:01:00 left, fires at 1:00:00
    expect(exitOfferReminderAt(endsAt, now)).toBeNull();
    expect(exitOfferReminderPending(endsAt, now)).toBe(true);
  });

  it("stops offering cancel once the reminder has fired", () => {
    expect(exitOfferReminderPending(endsAt, endsAt - HOUR)).toBe(false);
  });
});

describe("exitOfferReminderPlan", () => {
  const endsAt = 1_000_000_000_000;
  const HOUR = 60 * 60 * 1000;

  it("schedules an hour before the offer closes", () => {
    expect(exitOfferReminderPlan(endsAt, endsAt - 24 * HOUR)).toEqual({
      kind: "schedule",
      fireAt: endsAt - HOUR,
    });
  });

  it("keeps whatever the OS holds once the reminder is due within a minute", () => {
    expect(exitOfferReminderPlan(endsAt, endsAt - HOUR - 30_000)).toEqual({
      kind: "keep",
    });
    expect(exitOfferReminderPlan(endsAt, endsAt - 30 * 60_000)).toEqual({
      kind: "keep",
    });
  });

  it("cancels when there is no offer or the window has closed", () => {
    expect(exitOfferReminderPlan(null, endsAt)).toEqual({ kind: "cancel" });
    expect(exitOfferReminderPlan(endsAt, endsAt)).toEqual({ kind: "cancel" });
    expect(exitOfferReminderPlan(endsAt, endsAt + 1)).toEqual({
      kind: "cancel",
    });
  });
});

describe("formatCountdown", () => {
  it("shows hours, minutes and seconds", () => {
    expect(formatCountdown(EXIT_OFFER_WINDOW_MS)).toBe("24:00:00");
    expect(formatCountdown(((23 * 60 + 5) * 60 + 9) * 1000 + 999)).toBe(
      "23:05:09",
    );
  });

  it("stops at zero", () => {
    expect(formatCountdown(-5000)).toBe("00:00:00");
  });
});

describe("timeLeft", () => {
  it("rounds down so it never promises more time than is left", () => {
    expect(timeLeft(EXIT_OFFER_WINDOW_MS - 1)).toEqual({
      hours: 23,
      minutes: 59,
    });
    expect(timeLeft(-1)).toEqual({ hours: 0, minutes: 0 });
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
