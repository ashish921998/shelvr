import type { Device } from "@e2e-dev/mobile";
import { expect, type Screen } from "e2e";

import { BUNDLE_ID, LAUNCH_ARGUMENTS, openUntilReady } from "./launch.ts";
import { tapUntilVisible } from "./seeded-home.ts";

export async function startFreshOnboarding({
  device,
  screen,
}: {
  device: Device;
  screen: Screen;
}): Promise<void> {
  const start = screen.getByRole("button", "Start yours");
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

export async function walkToSharePractice(
  screen: Screen,
  goal: "Something else" | "Travel ideas" = "Something else",
): Promise<void> {
  await tapUntilVisible(
    screen.getByRole("button", "Start yours"),
    screen.getByText("What do you save?"),
    { waitMs: 5_000, timeout: 60_000 },
  );
  await screen.getByRole("button", new RegExp(`^${goal}`)).tap();
  if (goal === "Travel ideas") {
    // The last option, below the city list on an iPhone 17 screen.
    const notSure = screen.getByRole("button", /^Not sure yet/);
    await expect(screen.getByText("Where are you going next?")).toBeVisible({
      timeout: 30_000,
    });
    await screen.scrollUntilVisible(notSure);
    await notSure.tap();
  } else {
    await screen.getByRole("checkbox", /^AI & tech/).tap({ timeout: 30_000 });
    const next = screen.getByRole("button", "Continue");
    await expect(next).toBeEnabled({ timeout: 10_000 });
    await next.tap();
  }
  await expect(screen.getByRole("button", SHARE_LATER)).toBeVisible({
    timeout: 30_000,
  });
}

export async function relaunchWith(
  device: Device,
  screen: Screen,
  launchArguments: readonly string[],
  ready: () => Promise<boolean>,
): Promise<void> {
  await openUntilReady({
    open: () => device.openApp(BUNDLE_ID, { relaunch: true, launchArguments }),
    screen,
    ready,
    timeout: 180_000,
  });
  await expect(screen.getByRole("image", "Shelvr")).toBeHidden({
    timeout: 30_000,
  });
}

export const SHARE_LATER = "I'll try it later";
