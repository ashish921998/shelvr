import { beforeEach, describe, expect, it, vi } from "vitest";

import { isProHiddenForE2E } from "./e2e-hide-pro";

const mock = vi.hoisted(() => ({
  os: "ios",
  argument: undefined as unknown,
  devSignIn: true,
}));

vi.mock("react-native", () => ({
  Platform: {
    get OS() {
      return mock.os;
    },
  },
  Settings: {
    get: () => mock.argument,
  },
}));
vi.mock("@/lib/anonymous-auth", () => ({
  isAnonymousAuthEnabled: () => mock.devSignIn,
}));

describe("isProHiddenForE2E", () => {
  beforeEach(() => {
    mock.os = "ios";
    mock.argument = "YES";
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
