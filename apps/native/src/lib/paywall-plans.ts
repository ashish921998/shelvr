import type { TextMessageKey } from "@/locales/message-types";

/**
 * The paywall's step and plan state, its pricing math, and the copy each
 * plan shows. Pure, so the screen stays a renderer and every string the
 * user reads is decided here, where it is tested.
 *
 * Prices always come from the store through RevenueCat. Nothing here
 * assumes an amount: the per-month figure and the saving follow whatever
 * the annual and monthly packages cost.
 */

export type Plan = "annual" | "monthly";

export type PaywallState = {
  step: 0 | 1;
  slide: number;
  /** Autoplay stopped for good because the user swiped or tapped a dot. */
  paused: boolean;
  plan: Plan;
};

export const SLIDE_COUNT = 4;

export const initialPaywallState: PaywallState = {
  step: 0,
  slide: 0,
  paused: false,
  plan: "annual",
};

export type PaywallAction =
  | { type: "continue" }
  | { type: "back" }
  | { type: "selectPlan"; plan: Plan }
  /** The user picked a slide by swiping or tapping a dot. */
  | { type: "showSlide"; slide: number }
  /** The autoplay timer fired. */
  | { type: "autoplay" };

export function paywallReducer(
  state: PaywallState,
  action: PaywallAction,
): PaywallState {
  switch (action.type) {
    case "continue":
      return state.step === 1 ? state : { ...state, step: 1 };
    case "back":
      return state.step === 0 ? state : { ...state, step: 0 };
    case "selectPlan":
      return state.plan === action.plan
        ? state
        : { ...state, plan: action.plan };
    case "showSlide": {
      const slide = clampSlide(action.slide);
      if (slide === state.slide && state.paused) return state;
      return { ...state, slide, paused: true };
    }
    case "autoplay":
      // Autoplay only runs on the first step, and never after the user
      // took over the carousel.
      if (state.paused || state.step !== 0) return state;
      return { ...state, slide: (state.slide + 1) % SLIDE_COUNT };
  }
}

function clampSlide(slide: number): number {
  if (!Number.isFinite(slide)) return 0;
  return Math.min(SLIDE_COUNT - 1, Math.max(0, Math.round(slide)));
}

// ---------------------------------------------------------------------------
// Pricing
// ---------------------------------------------------------------------------

/** What a year costs spread over twelve months. */
export function perMonth(annualPrice: number): number {
  return annualPrice / 12;
}

/**
 * How much cheaper a year is than twelve months, as a whole percentage.
 * Null when there is no saving to claim, so the badge never shows 0% or a
 * negative number when store prices drift.
 */
export function savePct(
  annualPrice: number,
  monthlyPrice: number,
): number | null {
  if (!(annualPrice > 0) || !(monthlyPrice > 0)) return null;
  const pct = Math.round((1 - annualPrice / (monthlyPrice * 12)) * 100);
  return pct > 0 ? pct : null;
}

/**
 * Formats an amount in the store's currency. Hermes ships `Intl`, but a
 * currency it can't format still gets a readable price.
 */
export function formatMoney(
  amount: number,
  currencyCode: string,
  locale: string,
): string {
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: currencyCode,
    }).format(amount);
  } catch {
    return `${currencyCode} ${amount.toFixed(2)}`;
  }
}

// ---------------------------------------------------------------------------
// Trial eligibility
// ---------------------------------------------------------------------------

// INTRO_ELIGIBILITY_STATUS.INTRO_ELIGIBILITY_STATUS_ELIGIBLE in
// react-native-purchases; kept as a number so this module stays pure.
const INTRO_ELIGIBLE = 2;

/**
 * Whether the annual plan really starts with a free trial for this user.
 * The page promises "nothing to pay for seven days", so anything short of a
 * confirmed trial gets the plain subscription copy instead.
 *
 * - The product must carry a free introductory phase.
 * - On iOS, RevenueCat must also report the user eligible: Apple gives the
 *   trial once per subscription group. Unknown counts as not eligible.
 * - On Android, Google Play leaves offers the user can't redeem out of the
 *   product's default option, so the free phase alone answers it.
 */
export function annualTrialOffered(input: {
  introPrice:
    | { price: number; periodUnit?: string; periodNumberOfUnits?: number }
    | null
    | undefined;
  platform: string;
  iosEligibility?: number;
}): boolean {
  if (!input.introPrice || input.introPrice.price !== 0) return false;
  // The timeline and copy promise exactly seven days, so any other trial
  // length falls back to the plain annual copy rather than a wrong date.
  if (!isSevenDays(input.introPrice)) return false;
  if (input.platform === "ios") return input.iosEligibility === INTRO_ELIGIBLE;
  return true;
}

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

const TRIAL_DAYS = 7;

function isSevenDays(intro: {
  periodUnit?: string;
  periodNumberOfUnits?: number;
}): boolean {
  const unit = intro.periodUnit?.toUpperCase();
  const count = intro.periodNumberOfUnits;
  return (
    (unit === "DAY" && count === TRIAL_DAYS) || (unit === "WEEK" && count === 1)
  );
}
// lib/trial-reminder.ts schedules the reminder two days before renewal.
export const REMINDER_DAY = TRIAL_DAYS - 2;

/** Calendar days later, so a DST change keeps the local time of day. */
export function addDays(from: number, days: number): number {
  const at = new Date(from);
  at.setDate(at.getDate() + days);
  return at.getTime();
}

/** One calendar month later, clamped to the month's last day (Jan 31 → Feb 28). */
export function addMonths(from: number, months: number): number {
  const at = new Date(from);
  const day = at.getDate();
  at.setDate(1);
  at.setMonth(at.getMonth() + months);
  const last = new Date(at.getFullYear(), at.getMonth() + 1, 0).getDate();
  at.setDate(Math.min(day, last));
  return at.getTime();
}

// ---------------------------------------------------------------------------
// Copy
// ---------------------------------------------------------------------------

export type TimelineIcon =
  | "sparkles"
  | "calendar"
  | "checkmark.circle.fill"
  | "arrow.triangle.2.circlepath"
  | "arrow.left.arrow.right";

type DateKey =
  | "paywall.dateToday"
  | "paywall.dateDay"
  | "paywall.dateEveryMonth"
  | "paywall.dateEveryYear"
  | "paywall.dateAnyTime";

type HeadlineKey =
  | "paywall.trialToday"
  | "paywall.trialReminder"
  | "paywall.trialCharge"
  | "paywall.billedToday"
  | "paywall.renews"
  | "paywall.cancelAnyTime"
  | "paywall.switchAnnual";

export type TimelineRow = {
  icon: TimelineIcon;
  /** Filled amber, soft amber, or the muted end marker. */
  tone: "primary" | "soft" | "muted";
  dateKey: DateKey;
  /** The date the date line names, or null for "Any time". */
  date: number | null;
  /** "Day 5 · Oct 7" reads the day number from here. */
  day?: number;
  headlineKey: HeadlineKey;
  /** Whose price the headline quotes, if it quotes one. */
  price?: Plan;
  /** The day-5 row carries the reminder notification mock. */
  reminder?: boolean;
  /** The monthly "Any time" row offers the annual plan. */
  annualChip?: boolean;
};

export type PlanCopy = {
  titleKey: TextMessageKey;
  ctaKey: TextMessageKey;
  disclosureKey:
    | "paywall.disclosureTrial"
    | "paywall.disclosureAnnual"
    | "paywall.disclosureMonthly";
  timeline: TimelineRow[];
};

/**
 * The step-2 copy for the selected plan. `trial` is whether the annual plan
 * really starts with a free trial for this user (`annualTrialOffered`).
 * None of the button labels say "free": a trial is billed by the store
 * after it ends, and App Review reads "free" on a purchase button as a
 * claim the subscription costs nothing.
 */
export function planCopy(plan: Plan, trial: boolean, now: number): PlanCopy {
  if (plan === "annual" && trial) {
    return {
      titleKey: "paywall.planTitleTrial",
      ctaKey: "paywall.ctaTrial",
      disclosureKey: "paywall.disclosureTrial",
      timeline: [
        {
          icon: "sparkles",
          tone: "primary",
          dateKey: "paywall.dateToday",
          date: now,
          headlineKey: "paywall.trialToday",
        },
        {
          icon: "calendar",
          tone: "soft",
          dateKey: "paywall.dateDay",
          date: addDays(now, REMINDER_DAY),
          day: REMINDER_DAY,
          headlineKey: "paywall.trialReminder",
          reminder: true,
        },
        {
          icon: "checkmark.circle.fill",
          tone: "muted",
          dateKey: "paywall.dateDay",
          date: addDays(now, TRIAL_DAYS),
          day: TRIAL_DAYS,
          headlineKey: "paywall.trialCharge",
          price: "annual",
        },
      ],
    };
  }
  if (plan === "annual") {
    return {
      titleKey: "paywall.planTitle",
      ctaKey: "paywall.ctaAnnual",
      disclosureKey: "paywall.disclosureAnnual",
      timeline: [
        {
          icon: "sparkles",
          tone: "primary",
          dateKey: "paywall.dateToday",
          date: now,
          headlineKey: "paywall.billedToday",
          price: "annual",
        },
        {
          icon: "arrow.triangle.2.circlepath",
          tone: "soft",
          dateKey: "paywall.dateEveryYear",
          date: addMonths(now, 12),
          headlineKey: "paywall.renews",
          price: "annual",
        },
        {
          icon: "checkmark.circle.fill",
          tone: "muted",
          dateKey: "paywall.dateAnyTime",
          date: null,
          headlineKey: "paywall.cancelAnyTime",
        },
      ],
    };
  }
  return {
    titleKey: "paywall.planTitle",
    ctaKey: "paywall.ctaMonthly",
    disclosureKey: "paywall.disclosureMonthly",
    timeline: [
      {
        icon: "sparkles",
        tone: "primary",
        dateKey: "paywall.dateToday",
        date: now,
        headlineKey: "paywall.billedToday",
        price: "monthly",
      },
      {
        icon: "arrow.triangle.2.circlepath",
        tone: "soft",
        dateKey: "paywall.dateEveryMonth",
        date: addMonths(now, 1),
        headlineKey: "paywall.renews",
        price: "monthly",
      },
      {
        icon: "arrow.left.arrow.right",
        tone: "muted",
        dateKey: "paywall.dateAnyTime",
        date: null,
        headlineKey: "paywall.switchAnnual",
        annualChip: trial,
      },
    ],
  };
}
