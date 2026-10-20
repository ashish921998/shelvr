import * as Linking from "expo-linking";

// Links leave Shelvr for the system browser (or the app that claims the URL,
// such as TikTok or X) instead of an in-app browser sheet. An in-app browser
// lets people go on to any site from inside Shelvr, which Apple's age rating
// counts as unrestricted web access and rates 16+.
export function openLink(url: string): Promise<true> {
  return Linking.openURL(url);
}
