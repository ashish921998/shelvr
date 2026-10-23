import type { Screen } from "e2e";
import { pollUntil } from "./poll.ts";

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

const LAUNCHER_GRACE_MS = 15_000;

export async function openUntilReady({
  open,
  screen,
  ready,
  stalledMs = 75_000,
  onPoll,
  timeout,
}: {
  open: () => Promise<unknown>;
  screen: Screen;
  ready: () => Promise<boolean>;
  stalledMs?: number;
  onPoll?: () => Promise<void>;
  timeout: number;
}): Promise<void> {
  const reopen = async () => {
    await open();
    return Date.now();
  };
  let openedAt = await reopen();
  await pollUntil(
    async () => {
      if (await ready()) return true;
      const sinceOpen = Date.now() - openedAt;
      if (
        sinceOpen > stalledMs ||
        (sinceOpen > LAUNCHER_GRACE_MS &&
          (await screen.getByText("DEVELOPMENT SERVERS").isVisible()))
      ) {
        openedAt = await reopen();
      } else {
        await onPoll?.();
      }
      return false;
    },
    { timeout },
  );
}
