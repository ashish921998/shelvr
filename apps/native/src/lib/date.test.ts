import { describe, expect, it, vi } from "vitest";
import {
  formatLongDate,
  formatRecentDate,
  trialTimelineVariables,
} from "./date";

// A zone with daylight saving, so the tests cover a trial that crosses it.
process.env.TZ = "America/New_York";

const locale = vi.hoisted(() => ({ tag: "en-US" }));
vi.mock("./i18n", () => ({ formattingLocale: () => locale.tag }));

const at = (year: number, month: number, day: number) =>
  new Date(year, month - 1, day, 23, 30).getTime();
const text = (value: string) => ({ type: "string", value });

describe("trialTimelineVariables", () => {
  it("dates a seven-day trial from today, across a month end", () => {
    expect(
      trialTimelineVariables(at(2026, 10, 28), { unit: "DAY", count: 7 }),
    ).toEqual({
      trial_today: text(" · Oct 28"),
      trial_day5: text(" · Nov 2"),
      trial_day7: text(" · Nov 4"),
      trial_remind_date: text("Nov 2"),
      trial_remind_day: text("5"),
      trial_end_day: text("7"),
    });
  });

  it("follows the offer when the trial is not seven days", () => {
    expect(
      trialTimelineVariables(at(2026, 10, 28), { unit: "WEEK", count: 2 }),
    ).toMatchObject({
      trial_day5: text(" · Nov 9"),
      trial_day7: text(" · Nov 11"),
      trial_remind_day: text("12"),
      trial_end_day: text("14"),
    });
  });

  it("clamps a month trial to the last day of a shorter month", () => {
    const month = { unit: "MONTH", count: 1 };
    expect(trialTimelineVariables(at(2027, 1, 31), month)).toMatchObject({
      trial_day7: text(" · Feb 28"),
      trial_remind_date: text("Feb 26"),
      trial_end_day: text("28"),
    });
    expect(trialTimelineVariables(at(2028, 1, 31), month).trial_day7).toEqual(
      text(" · Feb 29"),
    );
    expect(trialTimelineVariables(at(2026, 10, 31), month).trial_day7).toEqual(
      text(" · Nov 30"),
    );
  });

  it("ends a year trial started on a leap day on February 28", () => {
    expect(
      trialTimelineVariables(at(2028, 2, 29), { unit: "YEAR", count: 1 }),
    ).toMatchObject({
      trial_day7: text(" · Feb 28"),
      trial_end_day: text("365"),
    });
  });

  it("matches the reminder across a daylight saving change", () => {
    // Clocks go back on Nov 1, 2026: seven elapsed days from 00:30 end at
    // 23:30 the day before, and the reminder fires 48 hours ahead of that.
    const now = new Date(2026, 9, 28, 0, 30).getTime();
    expect(
      trialTimelineVariables(now, { unit: "DAY", count: 7 }),
    ).toMatchObject({
      trial_day5: text(" · Nov 1"),
      trial_day7: text(" · Nov 3"),
      trial_remind_day: text("5"),
      trial_end_day: text("7"),
    });
  });
});

describe("formatRecentDate", () => {
  it("leaves out the year for a date this year", () => {
    expect(formatRecentDate(at(2026, 8, 14), at(2026, 10, 13))).toBe("Aug 14");
  });

  it("names the year for a date in an earlier year", () => {
    expect(formatRecentDate(at(2025, 8, 14), at(2026, 10, 13))).toBe(
      "Aug 14, 2025",
    );
  });
});

describe("formatLongDate", () => {
  it("spells the month out in the app's formatting locale", () => {
    expect(formatLongDate(at(2026, 7, 5))).toBe("July 5, 2026");
    locale.tag = "de-DE";
    try {
      expect(formatLongDate(at(2026, 7, 5))).toBe("5. Juli 2026");
    } finally {
      locale.tag = "en-US";
    }
  });
});
