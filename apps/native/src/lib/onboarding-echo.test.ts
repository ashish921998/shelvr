import { describe, expect, it, vi } from "vitest";
import { cityEchoText, savedEchoText } from "./onboarding-echo";

vi.mock("@/lib/i18n", () => ({
  t: (key: string, params?: Record<string, string>) =>
    params ? `${key}:${Object.values(params).join(",")}` : key,
}));

describe("savedEchoText", () => {
  it("echoes the amount the person gave, and a large one when they gave none", () => {
    expect(savedEchoText("tenToFifty")).toBe(
      "onboardingStatement.savedTenToFifty",
    );
    expect(savedEchoText("lostCount")).toBe(
      "onboardingStatement.savedLostCount",
    );
    expect(savedEchoText(null)).toBe("onboardingStatement.savedHundreds");
  });
});

describe("cityEchoText", () => {
  it("names the picked city and the city whose reel the demo plays", () => {
    expect(cityEchoText("austin", "austin")).toMatch(/cityPicked/);
    expect(cityEchoText("lisbon", "austin")).toMatch(/cityFirst/);
    expect(cityEchoText(null, "austin")).toMatch(/cityStart/);
  });
});
