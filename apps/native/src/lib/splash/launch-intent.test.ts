import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  isDeepLink,
  isDirectLaunch,
  markDirectLaunch,
  resetDirectLaunchForTests,
  subscribeDirectLaunch,
} from "./launch-intent";

beforeEach(() => {
  resetDirectLaunchForTests();
});

describe("isDeepLink", () => {
  it.each([
    "shelvr://expo-sharing",
    "shelvr://item/abc123",
    "shelvr://auth/callback",
    "https://shelvr.app/item/abc123",
    "app.shelvr.save://share",
  ])("treats %s as a link into the app", (path) => {
    expect(isDeepLink(path)).toBe(true);
  });

  it.each(["", "/", "/share", "item/abc123", "not a url"])(
    "treats %s as a plain launch",
    (path) => {
      expect(isDeepLink(path)).toBe(false);
    },
  );
});

describe("markDirectLaunch", () => {
  it("starts clear, so an ordinary launch still gets the animation", () => {
    expect(isDirectLaunch()).toBe(false);
  });

  it("records the launch", () => {
    markDirectLaunch();
    expect(isDirectLaunch()).toBe(true);
  });

  it("notifies a subscriber when the link lands after the splash started", () => {
    const listener = vi.fn();
    subscribeDirectLaunch(listener);
    markDirectLaunch();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("notifies only once, however many links arrive", () => {
    const listener = vi.fn();
    subscribeDirectLaunch(listener);
    markDirectLaunch();
    markDirectLaunch();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("stops notifying once unsubscribed", () => {
    const listener = vi.fn();
    subscribeDirectLaunch(listener)();
    markDirectLaunch();
    expect(listener).not.toHaveBeenCalled();
  });

  it("survives a subscriber that unsubscribes while being notified", () => {
    const calls: string[] = [];
    const unsubscribe = subscribeDirectLaunch(() => {
      calls.push("first");
      unsubscribe();
    });
    subscribeDirectLaunch(() => calls.push("second"));
    markDirectLaunch();
    expect(calls).toEqual(["first", "second"]);
  });
});
