import type { Device } from "@e2e-dev/mobile";
import { expect, type Screen } from "e2e";

import { BUNDLE_ID, LAUNCH_ARGUMENTS } from "./launch.ts";
import { pollUntil } from "./poll.ts";
import { tapUntilVisible } from "./seeded-home.ts";

export async function startFreshOnboarding({
  device,
  screen,
}: {
  device: Device;
  screen: Screen;
}): Promise<void> {
  const start = screen.getByRole("button", "Get started");
  await relaunchWith(device, screen, FRESH_INSTALL_ARGUMENTS, () =>
    start.isVisible(),
  );
}

// The app forgets its sign-in and onboarding state on this launch
// (src/lib/e2e-fresh-install.ts). Resetting the simulator keychain instead
// restarts the test runner, which takes minutes on CI.
const FRESH_INSTALL_ARGUMENTS = [
  ...LAUNCH_ARGUMENTS,
  "-E2EFreshInstall",
  "YES",
];

/** From the opener to the sample reel; defaults to date nights in the sample's own city (Prague). */
export async function walkToSampleReel(
  screen: Screen,
  options: { goal?: "date" | "travel"; city?: string } = {},
): Promise<void> {
  await tapUntilVisible(
    screen.getByRole("button", "Get started"),
    screen.getByText("How many places have you saved?"),
    { waitMs: 5_000, timeout: 60_000 },
  );
  const skip = screen.getByRole("button", "Skip");
  await skip.tap();
  await expect(screen.getByText("What would you like to plan?")).toBeVisible({
    timeout: 30_000,
  });
  await screen
    .getByRole(
      "checkbox",
      options.goal === "travel" ? /^Trips/ : /^Date nights/,
    )
    .tap();
  const next = screen.getByRole("button", "Continue");
  await expect(next).toBeEnabled({ timeout: 10_000 });
  await next.tap();
  await expect(screen.getByText("How do you like to plan?")).toBeVisible({
    timeout: 30_000,
  });
  await skip.tap();
  await expect(screen.getByText("Let’s put your saves to use.")).toBeVisible({
    timeout: 30_000,
  });
  await screen.getByTestId("onboarding-chart-continue").tap();
  await expect(screen.getByText("Pick a city to try.")).toBeVisible({
    timeout: 30_000,
  });
  if (options.city) {
    await screen.getByPlaceholder("Search cities").fill(options.city);
    await screen.getByRole("radio", options.city).tap();
  } else {
    await skip.tap();
  }
  await expect(screen.getByRole("button", SHARE_ON_REEL)).toBeVisible({
    timeout: 30_000,
  });
}

/** Shares the sample reel the way the walk teaches (Share, Share to…, More, pinning Shelvr with Edit, + and Done, then Shelvr) and waits for its spots, ready to tap Continue. */
export async function shareTheSampleReel(screen: Screen): Promise<void> {
  for (const step of [
    SHARE_ON_REEL,
    "Share to…",
    "More",
    "Edit",
    "Add Shelvr to Favorites",
    "Done",
  ]) {
    await screen.getByRole("button", step).tap({ timeout: 30_000 });
  }
  await screen.getByRole("button", SHARE_TO_SHELVR).tap({ timeout: 30_000 });
  await expect(screen.getByText(/· 3 places$/)).toBeVisible({
    timeout: 30_000,
  });
  await expect(screen.getByRole("button", "Continue")).toBeEnabled({
    timeout: 10_000,
  });
}

/** The map reveal leads to one commitment screen; confirming never opens the paywall on its own. */
export async function walkToCommitment(screen: Screen): Promise<void> {
  await screen.getByRole("button", "Continue").tap();
  await expect(screen.getByText("Visit a place you’ve saved.")).toBeVisible({
    timeout: 30_000,
  });
  await expect(screen.getByRole("button", "Hold to commit")).toBeVisible({
    timeout: 10_000,
  });
}

const STALLED_LAUNCH_MS = 75_000;

const LAUNCHER_GRACE_MS = 15_000;

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

const SHARE_TO_SHELVR = "Shelvr";

// The ringed share button on the sample reel; exact, so it never matches "Share to…".
export const SHARE_ON_REEL = /^Share$/;
