import type { Screen } from "e2e";

export const METRO_PORT = process.env.E2E_METRO_PORT ?? "8091";
export const METRO_URL = `http://localhost:${METRO_PORT}`;

export const BUNDLE_ID = "app.shelvr.save.dev";

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

export const LAUNCHER_GRACE_MS = 15_000;

export function isExpoLauncher(screen: Screen): Promise<boolean> {
  return screen.getByText("DEVELOPMENT SERVERS").isVisible();
}
