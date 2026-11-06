import { readFileSync } from "node:fs";
import { expect, it, vi } from "vitest";

vi.mock("react-native", () => ({ Platform: { OS: "ios", Version: "18.0" } }));

const { SIRI_SHORTCUTS, siriShortcuts } = await import("./siri-phrases");

const swift = readFileSync(
  new URL("../../app-intents/ShelvrShortcuts.swift", import.meta.url),
  "utf8",
);

it.each(SIRI_SHORTCUTS)(
  "shows every phrase without a parameter, and the iOS version, ShelvrShortcuts.swift gives $intent",
  ({ intent, minIos, phrases }) => {
    const start = swift.indexOf(`intent: ${intent}(),`);
    expect(start).toBeGreaterThan(-1);
    const block = swift.slice(start, swift.indexOf("shortTitle:", start));
    const spoken = [...block.matchAll(/"([^"]+)"/g)]
      .map(([, phrase]) => phrase)
      .filter((phrase) => !phrase.includes("\\(\\.$"))
      .map((phrase) => phrase.replace("\\(.applicationName)", "Shelvr"));
    expect(phrases).toEqual(spoken);
    const gates = [...swift.slice(0, start).matchAll(/#available\(iOS (\d+)/g)];
    expect(Number(gates.at(-1)?.[1])).toBe(minIos);
  },
);

const NOT_SAVES = ["SearchShelvrIntent"];

it("lists every Swift intent with a phrase you can say as is, except search, which is not a save", () => {
  const sayable = [...swift.matchAll(/intent: (\w+)\(\),[\s\S]*?shortTitle:/g)]
    .filter(([block]) =>
      [...block.matchAll(/"([^"]+)"/g)].some(
        ([, phrase]) => !phrase.includes("\\(\\.$"),
      ),
    )
    .map(([, intent]) => intent);
  expect(new Set(sayable)).toEqual(
    new Set([...SIRI_SHORTCUTS.map(({ intent }) => intent), ...NOT_SAVES]),
  );
});

const english = [{ languageCode: "en" }];
const intents = (version: string) =>
  siriShortcuts("ios", version, english).map((shortcut) => shortcut.intent);

it("offers Save a Link from iOS 18 and Save a Note from iOS 27", () => {
  expect(intents("18.0")).toEqual(["SaveLinkIntent"]);
  expect(intents("26.4")).toEqual(["SaveLinkIntent"]);
  expect(intents("27.0")).toEqual(["SaveLinkIntent", "SaveNoteIntent"]);
});

it("offers nothing on Android, before iOS 18, or outside English", () => {
  expect(siriShortcuts("android", 35, english)).toEqual([]);
  expect(siriShortcuts("ios", "17.5", english)).toEqual([]);
  expect(siriShortcuts("ios", "27.0", [{ languageCode: "de" }])).toEqual([]);
  expect(siriShortcuts("ios", "27.0", [{ languageCode: null }])).toEqual([]);
});

it("goes by the phone's first language, not the English the app falls back to", () => {
  const italianFirst = [{ languageCode: "it" }, { languageCode: "en" }];
  expect(siriShortcuts("ios", "27.0", italianFirst)).toEqual([]);
});
