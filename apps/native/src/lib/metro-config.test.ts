import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const config = require("../../metro.config.js") as {
  resolver: {
    resolveRequest: (
      context: { resolveRequest: (...args: unknown[]) => unknown },
      moduleName: string,
      platform: string | null,
    ) => unknown;
  };
};
const stub = require("../../metro/revenuecat-browser-mode.js") as {
  PurchasesCommon: {
    isConfigured: () => boolean;
    getInstance: () => unknown;
  };
};

const BROWSER_SDK = "@revenuecat/purchases-js-hybrid-mappings";

describe("metro resolver", () => {
  it.each(["ios", "android"])(
    "swaps RevenueCat's browser SDK for the stub on %s",
    (platform) => {
      const fallback = vi.fn();
      const resolved = config.resolver.resolveRequest(
        { resolveRequest: fallback },
        BROWSER_SDK,
        platform,
      );
      expect(resolved).toEqual({
        type: "sourceFile",
        filePath: expect.stringMatching(/metro\/revenuecat-browser-mode\.js$/),
      });
      expect(fallback).not.toHaveBeenCalled();
    },
  );

  it("keeps the real SDK on the web and resolves everything else normally", () => {
    const fallback = vi.fn(() => "resolved");
    const resolver = config.resolver.resolveRequest;
    expect(resolver({ resolveRequest: fallback }, BROWSER_SDK, "web")).toBe(
      "resolved",
    );
    expect(
      resolver({ resolveRequest: fallback }, "react-native-purchases", "ios"),
    ).toBe("resolved");
    expect(fallback).toHaveBeenCalledTimes(2);
  });

  it("stub reports unconfigured and refuses to run browser mode", () => {
    expect(stub.PurchasesCommon.isConfigured()).toBe(false);
    expect(() => stub.PurchasesCommon.getInstance()).toThrow(/browser mode/);
  });
});
