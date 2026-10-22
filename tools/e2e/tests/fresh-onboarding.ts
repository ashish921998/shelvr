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
  await device.closeApp().catch(() => undefined);
  await device.clearKeychain();
  const start = screen.getByRole("button", "Start yours");
  await relaunchWith(device, screen, LAUNCH_ARGUMENTS, () => start.isVisible());
}

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
    await screen.getByRole("button", "Not sure yet").tap({ timeout: 30_000 });
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

export const SHARE_LATER = "I'll try it later";
