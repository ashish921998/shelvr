// A port of its own, so the suite never loads another checkout's bundle from
// a Metro that happens to be running on 8081.
export const METRO_PORT = process.env.E2E_METRO_PORT ?? "8091";
export const METRO_URL = `http://localhost:${METRO_PORT}`;

export const BUNDLE_ID = "app.shelvr.save.dev";

// Skip the dev launcher and keep the dev menu and the development error
// banner from covering the app (src/lib/e2e-log-box.ts). The locators match
// English labels, so run the app in English whatever the simulator's language.
export const LAUNCH_ARGUMENTS = [
  "--initialUrl",
  METRO_URL,
  "-AppleLanguages",
  "(en)",
  "-AppleLocale",
  "en_US",
  "-EXDevMenuShowsAtLaunch",
  "NO",
  "-EXDevMenuIsOnboardingFinished",
  "YES",
  "-EXDevMenuShowFloatingActionButton",
  "NO",
  "-E2EHideLogBox",
  "YES",
];
