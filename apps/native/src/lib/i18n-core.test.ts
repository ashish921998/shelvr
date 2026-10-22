import { describe, expect, it } from "vitest";

import en from "@/locales/en.json";
import fr from "@/locales/fr.json";
import { translate } from "./i18n-core";

describe("translate", () => {
  it("falls back from a regional locale to its language, then English", () => {
    expect(translate("fr-BE", "brand.tagline")).toBe(fr["brand.tagline"]);
    expect(translate("fr-Latn-BE", "brand.tagline")).toBe(fr["brand.tagline"]);
    expect(translate("xx", "brand.tagline")).toBe(en["brand.tagline"]);
  });

  it("inserts values literally, even ones that look like replacement patterns", () => {
    expect(
      translate("en", "spaces.addedTo", { space: "$& and $1 and $$" }),
    ).toContain("$& and $1 and $$");
  });

  it("names a placeholder whose value is missing instead of dropping it", () => {
    expect(translate("en", "spaces.addedTo", {})).toContain(
      '[missing "%{space}" value]',
    );
  });

  it("uses the plural rule of the catalog a regional locale falls back to", () => {
    // French puts 0 in "one"; English would pick "other".
    expect(translate("fr-BE", "spaces.saveCount", { count: 0 })).toBe(
      translate("fr", "spaces.saveCount", { count: 0 }),
    );
  });

  it("picks the plural category for the locale and formats the count", () => {
    expect(translate("fr", "spaces.saveCount", { count: 1.5 })).toContain(
      "1,5",
    );
    expect(translate("en", "spaces.saveCount", { count: 1 })).toBe("1 save");
  });
});
