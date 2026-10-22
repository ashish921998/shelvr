import { beforeEach, describe, expect, it, vi } from "vitest";
import { CANCEL_SURVEY_REASONS, cancelSurveyAnalytics } from "./cancel-survey";
import { cancelSurveyReasonValidator } from "@convex/model/cancelSurveyFields";

const analyticsMock = vi.hoisted(() => ({ capture: vi.fn() }));
vi.mock("@/lib/analytics", () => ({ analytics: analyticsMock }));

describe("cancelSurveyAnalytics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("emits shown with no properties — presentation carries no user data", () => {
    cancelSurveyAnalytics.shown();

    expect(analyticsMock.capture).toHaveBeenCalledWith("cancel_survey_shown");
  });

  it("emits submitted with a bounded reason id only", () => {
    cancelSurveyAnalytics.submitted("too_expensive");

    expect(analyticsMock.capture).toHaveBeenCalledWith(
      "cancel_survey_submitted",
      { reason: "too_expensive", survey_source: "next_visit_card" },
    );
  });

  it("emits dismissed", () => {
    cancelSurveyAnalytics.dismissed();

    expect(analyticsMock.capture).toHaveBeenCalledWith(
      "cancel_survey_dismissed",
    );
  });

  it("every reason id is a valid CancelSurveyReason", () => {
    expect(CANCEL_SURVEY_REASONS).toEqual([
      "too_expensive",
      "not_useful_enough",
      "missing_feature",
      "other",
    ]);
  });

  it("the reason tuple and the Convex validator list the same ids in order", () => {
    expect(cancelSurveyReasonValidator.members.map((m) => m.value)).toEqual([
      ...CANCEL_SURVEY_REASONS,
    ]);
  });
});
