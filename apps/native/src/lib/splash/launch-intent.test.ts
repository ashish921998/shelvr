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
  // What `Linking.createURL("/")` returns for a production install.
  const ROOT = "shelvr:///";

  it.each([
    "shelvr://expo-sharing",
    "shelvr://item/abc123",
    "shelvr://auth/callback",
    "shelvr:///add",
    "shelvr:///?code=verification-code",
    "https://shelvr.app/item/abc123",
  ])("treats %s as a link into the app", (path) => {
    expect(isDeepLink(path, ROOT)).toBe(true);
  });

  // Expo Router does not hand us nothing on a home-screen launch: it falls
  // back to the app's own root URL and pushes that through the same handler.
  // Reading those as links is what made the splash never play at all, so the
  // shapes each install actually produces are pinned here.
  it.each([
    ["production", "shelvr:///", "shelvr:///"],
    ["no trailing slash", "shelvr://", "shelvr:///"],
    ["extra trailing slashes", "shelvr:////", "shelvr:///"],
    ["dev variant", "app.shelvr.save.dev:///", "app.shelvr.save.dev:///"],
    ["expo go", "exp://192.168.1.5:19000/--/", "exp://192.168.1.5:19000/--/"],
  ])("treats the %s root URL as a plain launch", (_name, path, root) => {
    expect(isDeepLink(path, root)).toBe(false);
  });

  it("still sees a real link under an Expo Go root", () => {
    const root = "exp://192.168.1.5:19000/--/";
    expect(isDeepLink("exp://192.168.1.5:19000/--/share", root)).toBe(true);
  });

  it("does not confuse two installs' roots", () => {
    // A dev build's root is not the production root, but neither is a link.
    expect(isDeepLink("app.shelvr.save.dev:///", "shelvr:///")).toBe(true);
  });

  it.each(["", "/", "/share", "item/abc123", "not a url"])(
    "treats %s as a plain launch",
    (path) => {
      expect(isDeepLink(path, ROOT)).toBe(false);
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
