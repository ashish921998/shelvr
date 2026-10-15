// A port of its own, so the suite never loads another checkout's bundle from
// a Metro that happens to be running on 8081.
export const METRO_PORT = process.env.E2E_METRO_PORT ?? "8091";
export const METRO_URL = `http://localhost:${METRO_PORT}`;

export const BUNDLE_ID = "app.shelvr.save.dev";

// The bundle Metro serves for the dev manifest. Opening it directly skips the
// manifest, which resolves the native fingerprint on every request: 5 to 15
// seconds on a GitHub runner, past the 10 seconds the dev launcher waits,
// which then shows its server list instead of the app.
const BUNDLE_URL = `${METRO_URL}/apps/native/index.ts.bundle?${new URLSearchParams(
  {
    platform: "ios",
    dev: "true",
    hot: "false",
    lazy: "true",
    "transform.engine": "hermes",
    "transform.bytecode": "1",
    "transform.routerRoot": "src/app",
    unstable_transformProfile: "hermes-stable",
  },
)}`;

// Skip the dev launcher and keep the dev menu and the development error
// banner from covering the app (src/lib/e2e-log-box.ts). The locators match
// English labels, so run the app in English whatever the simulator's language.
export const LAUNCH_ARGUMENTS = [
  "--initialUrl",
  BUNDLE_URL,
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
