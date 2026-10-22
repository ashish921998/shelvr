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

export async function walkToFirstSave(
  screen: Screen,
  kind: "Articles" | "Travel" = "Articles",
): Promise<void> {
  await tapUntilVisible(
    screen.getByRole("button", "Start yours"),
    screen.getByText("What are you into?"),
    { waitMs: 5_000, timeout: 60_000 },
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

export async function queueFirstSave(screen: Screen): Promise<void> {
  await screen.getByRole("button", /^Save it, /).tap();
  await screen.getByRole("button", "Continue").tap({ timeout: 60_000 });
  await expect(screen.getByRole("button", SHARE_LATER)).toBeVisible({
    timeout: 30_000,
  });
}

export const SHARE_LATER = "I'll try it later";
