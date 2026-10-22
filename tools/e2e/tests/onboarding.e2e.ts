import { afterEach, test } from "@e2e-dev/mobile";
import { expect } from "e2e";

import {
  REMINDER_STEP,
  relaunchWith,
  signInAndSaveFirst,
  startFreshOnboarding,
  walkToFirstSave,
} from "./fresh-onboarding.ts";
import { BUNDLE_ID, LAUNCH_ARGUMENTS } from "./launch.ts";
import { expectPaywall, paywallRestore } from "./paywall-sheet.ts";

afterEach(async ({ device }) => {
  await device.closeApp().catch(() => undefined);
  await device.clearKeychain();
});

test(
  "asks for the paywall at the end of onboarding and cold-launches the plan gate",
  { retries: 0, timeout: 600_000 },
  async ({ device, screen }) => {
    await startFreshOnboarding({ device, screen });
    await walkToFirstSave(screen);
    await screen.getByRole("button", /^Save it, /).tap();
    await signInAndSaveFirst(screen);

    const reminder = screen.getByText(REMINDER_STEP);
    await relaunchWith(
      device,
      screen,
      [...LAUNCH_ARGUMENTS, "-E2EHidePro", "YES"],
      () => reminder.isVisible(),
    );
    await screen.getByRole("button", "Don't remind me").tap();

    await screen.getByRole("button", "I'll try it later").tap({
      timeout: 30_000,
    });
    await screen.getByRole("button", "I'm in").tap({ timeout: 30_000 });
    await expectPaywall(screen);

    await screen.getByRole("button", "Close").first().tap();
    await expect(paywallRestore(screen)).toBeHidden({
      timeout: 30_000,
    });
    await expect(screen.getByRole("button", "See plans")).toBeVisible({
      timeout: 30_000,
    });

    await device.openApp(BUNDLE_ID, {
      relaunch: true,
      launchArguments: [...LAUNCH_ARGUMENTS, "-E2EHidePro", "YES"],
    });
    await expect(paywallRestore(screen)).toBeVisible({ timeout: 180_000 });
    await expectPaywall(screen);
    await screen.getByRole("button", "Close").first().tap();
    await expect(paywallRestore(screen)).toBeHidden({ timeout: 30_000 });
    await expect(screen.getByRole("button", "See plans")).toBeVisible({
      timeout: 30_000,
    });
    await expect(screen.getByRole("image", "Shelvr")).toBeHidden({
      timeout: 30_000,
    });
    await expect(screen.getByTestId("SplashScreenLogo")).toBeHidden({
      timeout: 30_000,
    });
    await expect(screen.getByRole("button", "Start yours")).toBeHidden();
  },
);
