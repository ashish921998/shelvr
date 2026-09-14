// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { t, useAppLocale, localizeError, formattingLocale } from "./i18n";
import { canonicalizeTag, resolveLocale, translate } from "./i18n-core";
import { formatItemDate } from "./date";
import de from "@/locales/de.json";
import ja from "@/locales/ja.json";

const device = vi.hoisted(() => ({
  tag: "en-US",
  listeners: new Set<() => void>(),
}));

vi.mock("expo-localization", async () => {
  const { useSyncExternalStore } = await import("react");
  return {
    getLocales: () => [{ languageTag: device.tag }],
    useLocales: () => {
      const tag = useSyncExternalStore(
        (listener) => {
          device.listeners.add(listener);
          return () => {
            device.listeners.delete(listener);
          };
        },
        () => device.tag,
      );
      return [{ languageTag: tag }];
    },
  };
});

function changeLanguage(tag: string) {
  act(() => {
    device.tag = tag;
    device.listeners.forEach((listener) => listener());
  });
}

beforeEach(() => {
  device.tag = "en-US";
});

describe("device language resolution", () => {
  it("shares canonicalization while preserving formatting extensions", () => {
    expect(canonicalizeTag("fr_ca_u_nu_latn")).toEqual({
      canonical: "fr-CA-u-nu-latn",
      baseName: "fr-CA",
    });
    expect(canonicalizeTag("invalid_tag!")).toBeUndefined();
    changeLanguage("fr_ca_u_nu_latn");
    expect(resolveLocale([device.tag])).toBe("fr-CA");
    expect(formattingLocale()).toBe("fr-CA-u-nu-latn");
  });
  it("works on Hermes without Intl.Locale", () => {
    const constructor = vi.spyOn(Intl, "Locale").mockImplementation(() => {
      throw new Error("Intl.Locale is unavailable");
    });
    try {
      expect(resolveLocale(["de-AT"])).toBe("de");
      expect(resolveLocale(["zh-TW", "ja-JP"])).toBe("ja");
      changeLanguage("en-IN");
      expect(formattingLocale()).toBe("en-IN");
      expect(constructor).not.toHaveBeenCalled();
    } finally {
      constructor.mockRestore();
    }
  });

  it.each([
    [["de-AT"], "de"],
    [["en-AU"], "en"],
    [["fr-CA"], "fr-CA"],
    [["zh-TW"], "en"],
    [["zh-HK"], "en"],
    [["zh-CN"], "en"],
    [["zh-Hans-TW"], "en"],
    [["zh-Hant-CN"], "en"],
    [["pt-PT"], "pt-BR"],
    [["pt-AO"], "pt-BR"],
    [["no-NO"], "en"],
    [["fr_CA"], "fr-CA"],
    [["not_a_language_tag", "ja-JP"], "ja"],
    [["zz-ZZ", "de-DE"], "de"],
    [[], "en"],
    [["zz-ZZ"], "en"],
  ])("resolves %j to %s", (tags, expected) => {
    expect(resolveLocale(tags)).toBe(expected);
  });

  it("updates a mounted UI and preserves its unsaved input", () => {
    function Example() {
      useAppLocale();
      return (
        <>
          <span>{t("navigation.search")}</span>
          <input aria-label="draft" defaultValue="My private draft" />
        </>
      );
    }
    render(<Example />);
    const input = screen.getByLabelText("draft");
    fireEvent.change(input, { target: { value: "Keep my edits" } });
    expect(screen.getByText("Search")).toBeTruthy();
    changeLanguage("de-DE");
    expect(screen.getByText(de["navigation.search"])).toBeTruthy();
    expect((input as HTMLInputElement).value).toBe("Keep my edits");
    changeLanguage("ja-JP");
    expect(screen.getByText(ja["navigation.search"])).toBeTruthy();
  });

  it("uses the current language for an already-created callback", () => {
    const alertTitle = () => t("common.tryAgain");
    changeLanguage("ja-JP");
    expect(alertTitle()).toBe(ja["common.tryAgain"]);
  });
});

describe("translated copy", () => {
  it("creates number formatters only for numeric values and reuses them by locale", () => {
    const numberFormat = Intl.NumberFormat;
    const constructor = vi
      .spyOn(Intl, "NumberFormat")
      .mockImplementation(function (locales, options) {
        return new numberFormat(locales, options);
      });
    try {
      translate("en", "navigation.search", {}, "en-NZ-u-nu-latn");
      translate("en", "spaces.addedTo", { space: "Home" }, "en-NZ-u-nu-latn");
      expect(constructor).not.toHaveBeenCalled();
      expect(
        translate("en", "spaces.saveCount", { count: 1234 }, "en-NZ-u-nu-latn"),
      ).toBe("1,234 saves");
      expect(
        translate("en", "spaces.saveCount", { count: 2345 }, "en-NZ-u-nu-latn"),
      ).toBe("2,345 saves");
      expect(constructor).toHaveBeenCalledTimes(1);
      expect(
        translate("en", "spaces.saveCount", { count: 2345 }, "de-LI-u-nu-latn"),
      ).toBe(`${new numberFormat("de-LI-u-nu-latn").format(2345)} saves`);
      expect(constructor).toHaveBeenCalledTimes(2);
    } finally {
      constructor.mockRestore();
    }
  });
  it("uses English text and dates with Indian number formatting for a Hindi device", () => {
    changeLanguage("hi-IN");
    expect(t("navigation.search")).toBe("Search");
    expect(formattingLocale()).toBe("en-IN");
    expect(t("spaces.saveCount", { count: 1234567 })).toBe("12,34,567 saves");
    expect(formatItemDate(Date.UTC(2026, 8, 13, 12))).toContain("Sep");
  });
  it("preserves regional number formatting when markets share translations", () => {
    changeLanguage("en-IN");
    expect(formattingLocale()).toBe("en-IN");
    expect(t("spaces.saveCount", { count: 1234567 })).toContain("12,34,567");
    changeLanguage("invalid_tag!");
    expect(formattingLocale()).toBe("en");
  });

  it("translates recognized failures and keeps unknown server details out of the UI", () => {
    changeLanguage("ja-JP");
    expect(localizeError("Give the space a name.")).toBe(
      ja["errors.spaceNameEmpty"],
    );
    expect(
      localizeError("Unexpected server detail at https://private.invalid"),
    ).toBe(ja["errors.saveFallback"]);
    expect(localizeError(undefined)).toBe(ja["errors.saveFallback"]);
  });

  it("preserves user names and URLs as values with semantic lookup keys", () => {
    expect(translate("de", "brand.tagline")).toBe(de["brand.tagline"]);
    expect(translate("ja", "spaces.addedTo", { space: "Home" })).toContain(
      "Home",
    );
    expect(
      translate("ja", "item.openSite", { site: "https://example.test/a?b=c" }),
    ).toContain("https://example.test/a?b=c");
  });
  it("formats counts for the app language without an English plural suffix", () => {
    changeLanguage("de-DE");
    expect(t("spaces.saveCount", { count: 1234 })).toContain("1.234");
    expect(t("spaces.saveCount", { count: 0 })).not.toContain("%{");
  });
  it("keeps both legal links available for any sentence ordering", () => {
    const sentence = t("legal.consent", { terms: "\uE000", privacy: "\uE001" });
    expect(sentence.match(/[\uE000\uE001]/g)?.sort()).toEqual([
      "\uE000",
      "\uE001",
    ]);
  });
});

it("selects CLDR plurals with numeric counts and regionally formatted interpolation", () => {
  expect(translate("en", "spaces.saveCount", { count: 0 })).toBe("0 saves");
  expect(translate("en", "spaces.saveCount", { count: 1 })).toBe("1 save");
  expect(translate("en", "spaces.saveCount", { count: 2 })).toBe("2 saves");
  expect(translate("en", "spaces.saveCount", { count: 1.5 })).toBe("1.5 saves");
  expect(translate("de", "spaces.saveCount", { count: 1234 })).toContain(
    "1.234",
  );
  expect(translate("ja", "spaces.saveCount", { count: 1 })).not.toContain(
    "[missing",
  );
  expect(() => translate("en", "spaces.saveCount", { count: "1" })).toThrow(
    "numeric count",
  );
});

it("rejects unchecked dynamic keys and missing values at compile time", () => {
  const compileOnly = (key: string) => {
    // @ts-expect-error Arbitrary strings must not become translation keys.
    t(key);
    // @ts-expect-error A renamed or missing key must fail before shipping.
    t("common.notARealKey");
    // @ts-expect-error Count messages require a numeric count.
    t("spaces.saveCount");
    // @ts-expect-error Formatting happens after plural selection.
    t("spaces.saveCount", { count: "1,000" });
    // @ts-expect-error Interpolation requires the named parameter.
    t("spaces.addedTo", {});
  };
  expect(compileOnly).toBeTypeOf("function");
});

it("keeps actionable photo failures while suppressing unknown server details", () => {
  changeLanguage("fr-FR");
  const message = t("capture.partialFailure", {
    saved: 1,
    total: 2,
    reason: localizeError(
      "Photo limit reached (1,000). Delete some photos to save more.",
    ),
  });
  expect(message).toContain("1 000");
  expect(message).not.toContain("%{");
  expect(localizeError("toString")).toBe(t("errors.saveFallback"));
});
