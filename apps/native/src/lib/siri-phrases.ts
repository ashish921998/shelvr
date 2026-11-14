import type { AppSymbolName } from "@/components/symbol";
import type { TextMessageKey } from "@/locales/message-types";
import { useLocales } from "expo-localization";
import { Platform } from "react-native";

export type SiriShortcut = {
  intent: string;
  minIos: number;
  icon: AppSymbolName;
  title: TextMessageKey;
  body: TextMessageKey;
  phrases: readonly string[];
};

export const SIRI_SHORTCUTS: readonly SiriShortcut[] = [
  {
    intent: "SaveLinkIntent",
    minIos: 18,
    icon: "link",
    title: "siri.saveLinkTitle",
    body: "siri.saveLinkBody",
    phrases: ["Save this page to Shelvr", "Save this link to Shelvr"],
  },
  {
    intent: "SaveNoteIntent",
    minIos: 27,
    icon: "square.and.pencil",
    title: "siri.saveNoteTitle",
    body: "siri.saveNoteBody",
    phrases: ["Save a note in Shelvr", "Add a note to Shelvr"],
  },
];

export function siriShortcuts(
  os: string,
  version: string | number,
  phoneLanguages: readonly { languageCode: string | null }[],
): readonly SiriShortcut[] {
  if (os !== "ios" || phoneLanguages[0]?.languageCode !== "en") return [];
  const major = Number(String(version).split(".")[0]);
  return SIRI_SHORTCUTS.filter((shortcut) => major >= shortcut.minIos);
}

export function useSiriShortcuts(): readonly SiriShortcut[] {
  return siriShortcuts(Platform.OS, Platform.Version, useLocales());
}
