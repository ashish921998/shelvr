import type { Device } from "@e2e-dev/mobile";
import { expect, type Screen } from "e2e";

import { BUNDLE_ID, LAUNCH_ARGUMENTS } from "./launch.ts";
import { pollUntil } from "./poll.ts";
import { tapUntilVisible } from "./seeded-home.ts";

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
 * Walks the opener, interests and setup steps, picking one kind of save
 * (Articles unless told otherwise), which seeds and picks a space of its own
 * so Continue enables. Ends on the first-save step.
 */
export async function walkToFirstSave(
  screen: Screen,
  kind: "Articles" | "Travel" = "Articles",
): Promise<void> {
  // The opener can drop its first tap while the splash is still fading out
  // (CI run 39388506914 stayed on the opener), so Start yours is tapped again
  // only if the interests step has not come up.
  await tapUntilVisible(
    screen.getByRole("button", "Start yours"),
    screen.getByText("What are you into?"),
    { waitMs: 5_000, timeout: 30_000 },
  );
  await screen.getByRole("button", "Continue").tap();
  await expect(screen.getByText("What do you save?")).toBeVisible({
    timeout: 30_000,
  });
  await screen.getByRole("checkbox", new RegExp(`^${kind}`)).tap();
  const next = screen.getByRole("button", "Continue");
  await expect(next).toBeEnabled({ timeout: 10_000 });
  await next.tap();
  await expect(screen.getByText(/^Save your first/)).toBeVisible({
    timeout: 30_000,
  });
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
  await pollUntil(
    async () => {
      if (await ready()) return true;
      const sinceOpen = Date.now() - openedAt;
      const stuckOnLauncher =
        sinceOpen > LAUNCHER_GRACE_MS && (await launcher.isVisible());
      if (sinceOpen > STALLED_LAUNCH_MS || stuckOnLauncher) await open();
      return false;
    },
    { timeout: 180_000 },
  );
  await expect(screen.getByRole("image", "Shelvr")).toBeHidden({
    timeout: 30_000,
  });
}

/**
 * Picks the featured sample while signed out. Its preview plays, then the
 * step shows the save as it will be filed, with Continue, which queues it
 * for after sign-in. The reminder step has no save to remind about and lets
 * the flow straight on, so this ends on the share practice.
 */
export async function queueFirstSave(screen: Screen): Promise<void> {
  await screen.getByRole("button", /^Save it, /).tap();
  await screen.getByRole("button", "Continue").tap({ timeout: 60_000 });
  await expect(screen.getByRole("button", SHARE_LATER)).toBeVisible({
    timeout: 30_000,
  });
}

/** The share practice's way on without sharing (`sharePractice.later`). */
export const SHARE_LATER = "I'll try it later";

/**
 * Signs in on the sign-in screen that follows a finished onboarding, the
 * only sign-in a new user sees, and waits for Home. The AI disclosure may
 * come up first.
 */
export async function signInAfterOnboarding(screen: Screen): Promise<void> {
  await screen.getByTestId("dev-login-button").tap({ timeout: 60_000 });
  const home = screen.getByRole("button", "Profile");
  const keepAi = screen.getByRole("button", "Keep it on");
  await pollUntil(
    async () => {
      if (await home.isVisible()) return true;
      if (await keepAi.isVisible()) await keepAi.tap();
      return false;
    },
    { timeout: 120_000 },
  );
}
