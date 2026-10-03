import { describe, expect, it, vi } from "vitest";
import { trialTimelineVariables } from "./date";

vi.mock("./i18n", () => ({ formattingLocale: () => "en-US" }));

describe("trialTimelineVariables", () => {
  it("dates the trial timeline from today, across a month end", () => {
    const now = new Date(2026, 9, 28, 23, 30).getTime();
    expect(trialTimelineVariables(now)).toEqual({
      trial_today: { type: "string", value: " · Oct 28" },
      trial_day5: { type: "string", value: " · Nov 2" },
      trial_day7: { type: "string", value: " · Nov 4" },
      trial_remind_date: { type: "string", value: "Nov 2" },
    });
  });

  it("follows the offer when the trial is not seven days", () => {
    const now = new Date(2026, 9, 28, 23, 30).getTime();
    expect(trialTimelineVariables(now, { unit: "WEEK", count: 2 })).toEqual({
      trial_today: { type: "string", value: " · Oct 28" },
      trial_day5: { type: "string", value: " · Nov 9" },
      trial_day7: { type: "string", value: " · Nov 11" },
      trial_remind_date: { type: "string", value: "Nov 9" },
    });
    expect(
      trialTimelineVariables(now, { unit: "MONTH", count: 1 }).trial_day7,
    ).toEqual({ type: "string", value: " · Nov 28" });
  });
});
