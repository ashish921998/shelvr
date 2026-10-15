import { execFile } from "node:child_process";
import { promisify } from "node:util";

import type { Device } from "@e2e-dev/mobile";
import { expect, type Screen } from "e2e";

import { BUNDLE_ID, LAUNCH_ARGUMENTS, URL_SCHEME } from "./launch.ts";

/**
 * Starts the app as a first-time user on the onboarding opener. Onboarding
 * is gated by a keychain flag and the dev sign-in token lives in the
 * keychain too, so clearing it signs out and forgets onboarding together
 * (docs/architecture/local-qa.md). The next dev sign-in is a new anonymous
 * user with an unused demo save.
 */
export async function startFreshOnboarding({
  device,
  screen,
}: {
  device: Device;
  screen: Screen;
}): Promise<void> {
  await device.closeApp().catch(() => undefined);
  await device.clearKeychain();
  const start = screen.getByRole("button", "Start yours");
  await relaunchWith(device, screen, LAUNCH_ARGUMENTS, () => start.isVisible());
}

/**
 * Walks the opener, interests and setup steps, picking Articles, which seeds
 * and picks a space of its own so Continue enables. Ends on the first-save
 * step.
 */
export async function walkToFirstSave(screen: Screen): Promise<void> {
  await screen.getByRole("button", "Start yours").tap();
  await expect(screen.getByText("What are you into?")).toBeVisible({
    timeout: 30_000,
  });
  await screen.getByRole("button", "Continue").tap();
  await expect(screen.getByText("What do you save?")).toBeVisible({
    timeout: 30_000,
  });
  await screen.getByRole("checkbox", /^Articles/).tap();
  const next = screen.getByRole("button", "Continue");
  await expect(next).toBeEnabled({ timeout: 10_000 });
  await next.tap();
  await expect(screen.getByText(/^Save your first/)).toBeVisible({
    timeout: 30_000,
  });
}

const execFileAsync = promisify(execFile);

/** The simulator the run drives: CI names it, a local run uses the booted one. */
const DEVICE = process.env.E2E_DEVICE ?? "booted";

/** The app group the share extension hands shares to the app through. */
const APP_GROUP = `group.${BUNDLE_ID}`;

/**
 * Puts a shared link where Shelvr's share extension leaves one, then opens
 * the link the extension opens. The share sheet itself is system UI whose
 * app row the accessibility tree does not list, so the extension's two
 * effects are reproduced instead: the payload in the app group's defaults
 * (expo-sharing's `expo-sharing` key, a JSON array of payloads) and the
 * `<scheme>://expo-sharing` launch.
 */
export async function shareLinkIntoApp(
  device: Device,
  screen: Screen,
  url: string,
): Promise<void> {
  const { stdout } = await execFileAsync("xcrun", [
    "simctl",
    "get_app_container",
    DEVICE,
    BUNDLE_ID,
    APP_GROUP,
  ]);
  const payload = JSON.stringify([
    { type: "url", value: url, mimeType: "text/plain" },
  ]);
  await execFileAsync("xcrun", [
    "simctl",
    "spawn",
    DEVICE,
    "defaults",
    "write",
    `${stdout.trim()}/Library/Preferences/${APP_GROUP}`,
    "expo-sharing",
    "-data",
    Buffer.from(payload).toString("hex"),
  ]);
  await device.openLink(`${URL_SCHEME}://expo-sharing`);

  // The simulator may ask before it opens the link in the app.
  const open = screen.getByRole("alert").getByRole("button", "Open");
  await open.tap({ timeout: 10_000 }).catch(() => undefined);
  await expect(open).toBeHidden({ timeout: 10_000 });
}

/**
 * A launch still on the splash after this long has lost its bundle request
 * (seen on CI: the request to Metro hung and the splash stayed up), so the
 * app is launched again.
 */
const STALLED_LAUNCH_MS = 75_000;

/**
 * The dev launcher's server list flashes briefly on a normal launch too, so
 * seeing it only counts as a failed launch once this long has passed.
 */
const LAUNCHER_GRACE_MS = 15_000;

/**
 * Relaunches the app with `launchArguments` and waits until `ready`. Like
 * `openApp`, it opens the app again when the dev launcher shows its server
 * list instead of the bundle, and also when a launch stalls on the splash.
 */
export async function relaunchWith(
  device: Device,
  screen: Screen,
  launchArguments: readonly string[],
  ready: () => Promise<boolean>,
): Promise<void> {
  const launcher = screen.getByText("Searching for development servers...");
  let openedAt = 0;
  const open = async () => {
    await device.openApp(BUNDLE_ID, { relaunch: true, launchArguments });
    openedAt = Date.now();
  };
  await open();
  await expect
    .poll(
      async () => {
        if (await ready()) return true;
        const sinceOpen = Date.now() - openedAt;
        const stuckOnLauncher =
          sinceOpen > LAUNCHER_GRACE_MS && (await launcher.isVisible());
        if (sinceOpen > STALLED_LAUNCH_MS || stuckOnLauncher) await open();
        return false;
      },
      { timeout: 180_000 },
    )
    .toBe(true);
  await expect(screen.getByRole("image", "Shelvr")).toBeHidden({
    timeout: 30_000,
  });
}

/** The reminder step's question (`onboarding.remindQuestion`). */
export const REMINDER_STEP = /When should it come back\?/;

/**
 * Signs in from the first-save step with the dev login, which onboarding
 * offers once a link is picked or shared, and waits for the reminder step.
 * The model is a placeholder on CI, so the save may never be read: whichever
 * way out the reading screen offers is taken, since the reminder step only
 * needs the save to exist.
 */
export async function signInAndSaveFirst(screen: Screen): Promise<void> {
  await screen.getByTestId("onboarding-dev-login").tap({ timeout: 60_000 });

  const reminder = screen.getByText(REMINDER_STEP);
  const keepAi = screen.getByRole("button", "Keep it on");
  const skipWait = screen.getByRole("button", "Continue without waiting");
  const afterFailure = screen.getByRole("button", "Continue");
  await expect
    .poll(
      async () => {
        if (await reminder.isVisible()) return true;
        if (await keepAi.isVisible()) await keepAi.tap();
        else if (await skipWait.isVisible()) await skipWait.tap();
        else if (await afterFailure.isVisible()) await afterFailure.tap();
        return false;
      },
      { timeout: 120_000 },
    )
    .toBe(true);
}
