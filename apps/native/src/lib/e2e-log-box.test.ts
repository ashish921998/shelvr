import { beforeEach, describe, expect, it, vi } from "vitest";

import { hideLogBoxForE2E } from "./e2e-log-box";

const mock = vi.hoisted(() => ({
  os: "ios",
  argument: undefined as unknown,
  devSignIn: true,
  ignoreAllLogs: vi.fn(),
}));

vi.mock("react-native", () => ({
  LogBox: { ignoreAllLogs: mock.ignoreAllLogs },
  Platform: {
    get OS() {
      return mock.os;
    },
  },
  Settings: { get: () => mock.argument },
}));
vi.mock("@/lib/anonymous-auth", () => ({
  isAnonymousAuthEnabled: () => mock.devSignIn,
}));

describe("hideLogBoxForE2E", () => {
  beforeEach(() => {
    mock.os = "ios";
    mock.argument = "YES";
    mock.devSignIn = true;
    mock.ignoreAllLogs.mockReset();
  });

  it("hides the banner on a development build launched with the argument", () => {
    hideLogBoxForE2E();
    expect(mock.ignoreAllLogs).toHaveBeenCalledTimes(1);
  });

  it("leaves the banner alone without the argument", () => {
    for (const value of [undefined, null, "NO", "", 1, true]) {
      mock.argument = value;
      hideLogBoxForE2E();
    }
    expect(mock.ignoreAllLogs).not.toHaveBeenCalled();
  });

  it("leaves it alone on a build without dev sign-in", () => {
    mock.devSignIn = false;
    hideLogBoxForE2E();
    expect(mock.ignoreAllLogs).not.toHaveBeenCalled();
  });

  it("leaves it alone off iOS", () => {
    mock.os = "android";
    hideLogBoxForE2E();
    expect(mock.ignoreAllLogs).not.toHaveBeenCalled();
  });
});
