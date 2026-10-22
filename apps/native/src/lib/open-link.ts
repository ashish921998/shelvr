import * as Linking from "expo-linking";

export function openLink(url: string): Promise<true> {
  return Linking.openURL(url);
}
