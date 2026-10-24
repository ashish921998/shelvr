import { afterEach, test } from "@e2e-dev/mobile";
import { expect, type Screen } from "e2e";

import {
  SHARE_TO_SHELVR,
  relaunchWith,
  startFreshOnboarding,
  walkToSampleReel,
} from "./fresh-onboarding.ts";
import { BUNDLE_ID, LAUNCH_ARGUMENTS } from "./launch.ts";
import { expectPaywall } from "./paywall-sheet.ts";
import { pollUntil } from "./poll.ts";

const NOT_NOW = "Not now";

// A tap that lands while the reminder screen settles is dropped, so tap
// until the screen gives way to the paywall.
async function openPaywall(screen: Screen): Promise<void> {
  const notNow = screen.getByRole("button", NOT_NOW);
  await pollUntil(
    async () => {
      if (!(await notNow.isVisible())) return true;
      await notNow.tap({ timeout: 5_000 }).catch(() => undefined);
      await expect(notNow)
        .toBeHidden({ timeout: 5_000 })
        .catch(() => undefined);
      return !(await notNow.isVisible());
    },
    { timeout: 60_000 },
  );
}

// Leave the app signed out at the opener, not mid-onboarding, for the next test.
afterEach(async ({ device, screen }) => {
  await startFreshOnboarding({ device, screen });
  await device.closeApp().catch(() => undefined);
});

/** Saves the sample reel and walks its spots and plan, up to the trial reminder. */
async function walkTheSample(screen: Screen): Promise<void> {
  await screen.getByRole("button", SHARE_TO_SHELVR).tap();
  await expect(screen.getByText("Found 3 spots in that reel")).toBeVisible({
    timeout: 30_000,
  });
  const next = screen.getByRole("button", "Continue");
  await expect(next).toBeEnabled({ timeout: 10_000 });
  await next.tap();
  await screen
    .getByRole("button", "Save your own spots")
    .tap({ timeout: 30_000 });
}

test(
  "asks for the paywall at the end of onboarding, and a relaunch comes back to it",
  { retries: 0, timeout: 600_000 },
  async ({ device, screen }) => {
    await startFreshOnboarding({ device, screen });
    await walkToSampleReel(screen);

    const share = screen.getByRole("button", SHARE_TO_SHELVR);
    await relaunchWith(
      device,
      screen,
      [...LAUNCH_ARGUMENTS, "-E2EHidePro", "YES"],
      () => share.isVisible(),
    );

    await walkTheSample(screen);
    // The reminder screen comes between the sample plan and the paywall. The
    // paywall has no close, so a relaunch is how someone leaves it; they land
    // back on the reminder screen, still signed out.
    const commit = screen.getByRole("button", NOT_NOW);
    await expect(commit).toBeVisible({ timeout: 30_000 });
    await openPaywall(screen);
    await expectPaywall(screen);

    await device.openApp(BUNDLE_ID, {
      relaunch: true,
      launchArguments: [...LAUNCH_ARGUMENTS, "-E2EHidePro", "YES"],
    });
    await expect(commit).toBeVisible({ timeout: 180_000 });
    await expect(screen.getByTestId("SplashScreenLogo")).toBeHidden({
      timeout: 30_000,
    });
    await expect(screen.getByTestId("dev-login-button")).toBeHidden();
    await openPaywall(screen);
    await expectPaywall(screen);
  },
);

test(
  "turns one sample reel into a date night, then asks about the trial reminder and the paywall",
  { retries: 0, timeout: 600_000 },
  async ({ device, screen }) => {
    await startFreshOnboarding({ device, screen });
    await walkToSampleReel(screen);

    await screen.getByRole("button", SHARE_TO_SHELVR).tap();
    await expect(screen.getByText("Found 3 spots in that reel")).toBeVisible({
      timeout: 30_000,
    });
    // The map pin carries the same label as the list row.
    await expect(screen.getByText("Kampa Park").first()).toBeVisible({
      timeout: 30_000,
    });
    const next = screen.getByRole("button", "Continue");
    await expect(next).toBeEnabled({ timeout: 10_000 });
    await next.tap();
    await expect(screen.getByText("Your date night in Prague")).toBeVisible({
      timeout: 30_000,
    });
    await screen.getByRole("button", "Save your own spots").tap();

    await expect(
      screen.getByText("We'll remind you before it ends"),
    ).toBeVisible({ timeout: 30_000 });
    await openPaywall(screen);
    await expectPaywall(screen);
  },
);
