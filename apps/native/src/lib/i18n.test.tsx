// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { t, useAppLocale, localizeError, formattingLocale } from "./i18n";
import { resolveLocale, translate } from "./i18n-core";
import de from "@/locales/de.json";
import ja from "@/locales/ja.json";

const device = vi.hoisted(() => ({
  tag: "en-US",
  listeners: new Set<() => void>(),
}));

vi.mock("@/locales/catalogs", async () => {
  const en = (await import("@/locales/en.json")).default;
  const de = (await import("@/locales/de.json")).default;
  const ja = (await import("@/locales/ja.json")).default;
  return {
    catalogs: {
      en,
      de,
      ja,
      "zh-Hans": en,
      "zh-Hant": en,
      "pt-BR": en,
      "pt-PT": en,
      nb: en,
      fr: en,
      "fr-CA": en,
      ar: en,
    },
  };
});
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
  it("works on Hermes without Intl.Locale", () => {
    const constructor = vi.spyOn(Intl, "Locale").mockImplementation(() => {
      throw new Error("Intl.Locale is unavailable");
    });
    try {
      expect(resolveLocale(["de-AT"])).toBe("de");
      expect(resolveLocale(["zh-TW"])).toBe("zh-Hant");
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
    [["zh-TW"], "zh-Hant"],
    [["zh-HK"], "zh-Hant"],
    [["zh-CN"], "zh-Hans"],
    [["zh-Hans-TW"], "zh-Hans"],
    [["zh-Hant-CN"], "zh-Hant"],
    [["pt-PT"], "pt-PT"],
    [["pt-AO"], "pt-BR"],
    [["no-NO"], "nb"],
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
          <span>{t("Search")}</span>
          <input aria-label="draft" defaultValue="My private draft" />
        </>
      );
    }
    render(<Example />);
    const input = screen.getByLabelText("draft");
    fireEvent.change(input, { target: { value: "Keep my edits" } });
    expect(screen.getByText("Search")).toBeTruthy();
    changeLanguage("de-DE");
    expect(screen.getByText(de.Search)).toBeTruthy();
    expect((input as HTMLInputElement).value).toBe("Keep my edits");
    changeLanguage("ja-JP");
    expect(screen.getByText(ja.Search)).toBeTruthy();
  });

  it("uses the current language for an already-created callback", () => {
    const alertTitle = () => t("Try again");
    changeLanguage("ja-JP");
    expect(alertTitle()).toBe(ja["Try again"]);
  });
});

describe("translated copy", () => {
  it("preserves regional number formatting when markets share translations", () => {
    changeLanguage("en-IN");
    expect(formattingLocale()).toBe("en-IN");
    expect(t("Saves: %{count}", { count: 1234567 })).toContain("12,34,567");
    changeLanguage("invalid_tag!");
    expect(formattingLocale()).toBe("en");
  });

  it("translates recognized failures and keeps unknown server details out of the UI", () => {
    changeLanguage("ja-JP");
    expect(localizeError("Give the space a name.")).toBe(
      ja["Give the space a name."],
    );
    expect(
      localizeError("Unexpected server detail at https://private.invalid"),
    ).toBe(ja["Save failed. Please try again."]);
    expect(localizeError(undefined)).toBe(ja["Save failed. Please try again."]);
  });

  it("preserves names, URLs, and punctuation-containing lookup keys", () => {
    expect(translate("de", "Save it for later.")).toBe(
      de["Save it for later."],
    );
    expect(translate("de", "User's unrecognized private title")).toBe(
      "User's unrecognized private title",
    );
    expect(translate("ja", "Added to %{space}", { space: "Home" })).toContain(
      "Home",
    );
    expect(
      translate("ja", "Open %{site}", { site: "https://example.test/a?b=c" }),
    ).toContain("https://example.test/a?b=c");
  });
  it("formats counts for the app language without an English plural suffix", () => {
    changeLanguage("de-DE");
    expect(t("Saves: %{count}", { count: 1234 })).toContain("1.234");
    expect(t("Saves: %{count}", { count: 0 })).not.toContain("%{");
  });
  it("keeps both legal links available for any sentence ordering", () => {
    const sentence = t(
      "By continuing, you agree to our %{terms} and acknowledge our %{privacy}.",
      { terms: "\uE000", privacy: "\uE001" },
    );
    expect(sentence.match(/[\uE000\uE001]/g)?.sort()).toEqual([
      "\uE000",
      "\uE001",
    ]);
  });
});
