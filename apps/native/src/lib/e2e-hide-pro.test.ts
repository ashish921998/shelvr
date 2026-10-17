import { beforeEach, describe, expect, it, vi } from "vitest";

import { isExitOfferForcedForE2E, isProHiddenForE2E } from "./e2e-hide-pro";

const mock = vi.hoisted(() => ({
  os: "ios",
  argument: undefined as unknown,
  exitOffer: undefined as unknown,
  devSignIn: true,
}));

vi.mock("react-native", () => ({
  Platform: {
    get OS() {
      return mock.os;
    },
  },
  Settings: {
    get: (key: string) =>
      key === "E2EExitOffer" ? mock.exitOffer : mock.argument,
  },
}));
vi.mock("@/lib/anonymous-auth", () => ({
  isAnonymousAuthEnabled: () => mock.devSignIn,
}));

describe("isProHiddenForE2E", () => {
  beforeEach(() => {
    mock.os = "ios";
    mock.argument = "YES";
    mock.exitOffer = undefined;
    mock.devSignIn = true;
  });

  it("hides Pro on a development build launched with the argument", () => {
    expect(isProHiddenForE2E()).toBe(true);
  });

  it("does nothing without the argument", () => {
    for (const value of [undefined, null, "NO", "", 1, true]) {
      mock.argument = value;
      expect(isProHiddenForE2E()).toBe(false);
    }
  });

  it("does nothing on a build without dev sign-in, whatever it is launched with", () => {
    mock.devSignIn = false;
    expect(isProHiddenForE2E()).toBe(false);
  });

  it("does nothing off iOS", () => {
    mock.os = "android";
    expect(isProHiddenForE2E()).toBe(false);
  });
});

describe("isExitOfferForcedForE2E", () => {
  beforeEach(() => {
    mock.os = "ios";
    mock.argument = "YES";
    mock.exitOffer = "YES";
    mock.devSignIn = true;
  });

  it("asks for the exit offer when Pro is hidden and the argument is set", () => {
    expect(isExitOfferForcedForE2E()).toBe(true);
  });

  it("does nothing without the argument", () => {
    mock.exitOffer = "NO";
    expect(isExitOfferForcedForE2E()).toBe(false);
  });

  it("does nothing unless Pro is hidden too", () => {
    mock.argument = undefined;
    expect(isExitOfferForcedForE2E()).toBe(false);
    mock.argument = "YES";
    mock.devSignIn = false;
    expect(isExitOfferForcedForE2E()).toBe(false);
  });
});
