import { readFileSync } from "node:fs";
import { expect, it, vi } from "vitest";

vi.mock("react-native", () => ({ Platform: { OS: "ios", Version: "18.0" } }));
vi.mock("@/lib/i18n", () => ({ useAppLocale: () => "en" }));

const { SIRI_SHORTCUTS, siriShortcuts } = await import("./siri-phrases");

const swift = readFileSync(
  new URL("../../app-intents/ShelvrShortcuts.swift", import.meta.url),
  "utf8",
);

it.each(SIRI_SHORTCUTS)(
  "shows only the phrases and iOS version ShelvrShortcuts.swift gives $intent",
  ({ intent, minIos, phrases }) => {
    const start = swift.indexOf(`intent: ${intent}(),`);
    expect(start).toBeGreaterThan(-1);
    const block = swift.slice(start, swift.indexOf("shortTitle:", start));
    for (const phrase of phrases) {
      expect(block).toContain(
        `"${phrase.replace("Shelvr", "\\(.applicationName)")}"`,
      );
    }
    const gates = [...swift.slice(0, start).matchAll(/#available\(iOS (\d+)/g)];
    expect(Number(gates.at(-1)?.[1])).toBe(minIos);
  },
);

const intents = (version: string) =>
  siriShortcuts("ios", version, "en").map((shortcut) => shortcut.intent);

it("offers Save a Link from iOS 18 and Save a Note from iOS 27", () => {
  expect(intents("18.0")).toEqual(["SaveLinkIntent"]);
  expect(intents("26.4")).toEqual(["SaveLinkIntent"]);
  expect(intents("27.0")).toEqual(["SaveLinkIntent", "SaveNoteIntent"]);
});

it("offers nothing on Android, before iOS 18, or outside English", () => {
  expect(siriShortcuts("android", 35, "en")).toEqual([]);
  expect(siriShortcuts("ios", "17.5", "en")).toEqual([]);
  expect(siriShortcuts("ios", "27.0", "de")).toEqual([]);
});
