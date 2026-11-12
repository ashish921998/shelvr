import { describe, expect, it, vi } from "vitest";
import { cityEchoText } from "./onboarding-echo";

vi.mock("@/lib/i18n", () => ({
  t: (key: string, params?: Record<string, string>) =>
    params ? `${key}:${Object.values(params).join(",")}` : key,
}));

describe("cityEchoText", () => {
  it("names the picked city and the city whose reel the demo plays", () => {
    expect(cityEchoText("austin", "austin")).toBe(
      "onboardingStatement.cityPicked:tripTeaser.cityAustin",
    );
    expect(cityEchoText("lisbon", "austin")).toBe(
      "onboardingStatement.cityFirst:tripTeaser.cityLisbon,tripTeaser.cityAustin",
    );
    expect(cityEchoText(null, "austin")).toBe(
      "onboardingStatement.cityStart:tripTeaser.cityAustin",
    );
  });
});
