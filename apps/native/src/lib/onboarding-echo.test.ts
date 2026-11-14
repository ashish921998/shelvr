import { describe, expect, it, vi } from "vitest";
import { cityEchoText } from "./onboarding-echo";

vi.mock("@/lib/i18n", () => ({
  t: (key: string, params?: Record<string, string>) =>
    params ? `${key}:${Object.values(params).join(",")}` : key,
}));

describe("cityEchoText", () => {
  it("names the city whose reel the demo plays", () => {
    expect(cityEchoText("austin", "austin")).toBe(
      "onboardingStatement.cityPicked:tripTeaser.cityAustin",
    );
    expect(cityEchoText("lisbon", "lisbon")).toBe(
      "onboardingStatement.cityPicked:tripTeaser.cityLisbon",
    );
    expect(cityEchoText(null, "austin")).toBe(
      "onboardingStatement.cityStart:tripTeaser.cityAustin",
    );
  });
});
