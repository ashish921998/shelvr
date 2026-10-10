import * as WebBrowser from "expo-web-browser";

// On Android, expo-web-browser's default launches the Custom Tab through a
// proxy activity with its own task affinity, which always shows in recents
// with Shelvr's icon. When the tab hands off to another app (an x.com link
// opening X) or the user leaves through recents, that task lingers as a second,
// blank "Shelvr" card. Opening the tab inside Shelvr's own task keeps recents
// to one card. iOS ignores the option.
export function openInAppBrowser(url: string) {
  return WebBrowser.openBrowserAsync(url, { createTask: false });
}
