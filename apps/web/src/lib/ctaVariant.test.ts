// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CTA_VARIANT_SCRIPT, ctaVariant } from "./ctaVariant";

const KEY = "shelvr_cta_variant";

let stored: Map<string, string>;

function mapStorage(): Pick<Storage, "getItem" | "setItem"> {
  return {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => stored.set(key, value),
  };
}

function stubStorage(storage: Pick<Storage, "getItem" | "setItem">) {
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: storage,
  });
}

function blocked(): never {
  throw new Error("storage is blocked");
}

function runScript() {
  new Function(CTA_VARIANT_SCRIPT)();
}

function shown() {
  return document.documentElement.getAttribute("data-cta");
}

beforeEach(() => {
  stored = new Map();
  stubStorage(mapStorage());
  document.documentElement.removeAttribute("data-cta");
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("the variant script", () => {
  it.each([
    [0.2, "plain"],
    [0.7, "emoji"],
  ])("assigns a first visit that draws %s to %s", (draw, variant) => {
    vi.spyOn(Math, "random").mockReturnValue(draw);

    runScript();

    expect(stored.get(KEY)).toBe(variant);
    expect(shown()).toBe(variant);
  });

  it("keeps a stored variant without drawing again", () => {
    stored.set(KEY, "emoji");
    const random = vi.spyOn(Math, "random");

    runScript();

    expect(random).not.toHaveBeenCalled();
    expect(stored.get(KEY)).toBe("emoji");
    expect(shown()).toBe("emoji");
  });

  it("replaces a stored value that is not a variant", () => {
    stored.set(KEY, "x");
    vi.spyOn(Math, "random").mockReturnValue(0.2);

    runScript();

    expect(stored.get(KEY)).toBe("plain");
    expect(shown()).toBe("plain");
  });

  it("shows no variant when storage cannot be read", () => {
    stubStorage({ getItem: blocked, setItem: blocked });

    expect(runScript).not.toThrow();
    expect(shown()).toBeNull();
  });

  it("shows no variant when storage cannot be written", () => {
    stubStorage({ ...mapStorage(), setItem: blocked });

    expect(runScript).not.toThrow();
    expect(shown()).toBeNull();
  });
});

describe("ctaVariant", () => {
  it("reports the variant the page shows over the stored one", () => {
    stored.set(KEY, "plain");
    document.documentElement.setAttribute("data-cta", "emoji");

    expect(ctaVariant()).toBe("emoji");
  });

  it("falls back to storage when the page shows no variant", () => {
    stored.set(KEY, "emoji");

    expect(ctaVariant()).toBe("emoji");
  });

  it("reports nothing for a value that is not a variant", () => {
    document.documentElement.setAttribute("data-cta", "x");
    expect(ctaVariant()).toBeUndefined();

    document.documentElement.removeAttribute("data-cta");
    stored.set(KEY, "x");
    expect(ctaVariant()).toBeUndefined();
  });

  it("reports nothing when no variant was assigned", () => {
    expect(ctaVariant()).toBeUndefined();
  });

  it("reports nothing when storage throws", () => {
    stubStorage({ getItem: blocked, setItem: blocked });

    expect(ctaVariant()).toBeUndefined();
  });
});
