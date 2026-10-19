import { afterEach, test } from "@e2e-dev/mobile";
import { expect } from "e2e";

import {
  SHARE_LATER,
  queueFirstSave,
  relaunchWith,
  signInAfterOnboarding,
  startFreshOnboarding,
  walkToFirstSave,
} from "./fresh-onboarding.ts";
import { LAUNCH_ARGUMENTS } from "./launch.ts";
import { expectPaywall } from "./paywall-sheet.ts";

// A run that stops partway leaves a signed-in user mid-onboarding, which the
// seeded flows after this one cannot get past (CI run 39048570372: seven
// files timed out on the reminder step). Clearing the keychain leaves the
// app on the opener, where they start from.
afterEach(async ({ device }) => {
  await device.closeApp().catch(() => undefined);
  await device.clearKeychain();
});

// A first-time user who picked one link, relaunched mid-onboarding, took
// the promise, declined the paywall at the end and only then signed in: the
// paywall comes before the account, and sign-in is asked once. Pro is hidden
// from the relaunch on (src/lib/e2e-hide-pro.ts), so the dev user, Pro on
// the server, lands on Home without a second paywall.
test("asks for the paywall at the end of onboarding, then sign-in once", async ({
  device,
  screen,
}) => {
  await startFreshOnboarding({ device, screen });
  await walkToFirstSave(screen);
  await queueFirstSave(screen);

  // A relaunch here resumes on the share practice, not past it.
  const shareLater = screen.getByRole("button", SHARE_LATER);
  await relaunchWith(
    device,
    screen,
    [...LAUNCH_ARGUMENTS, "-E2EHidePro", "YES"],
    () => shareLater.isVisible(),
  );

  // The share practice, skipped, then the promise step, and then the
  // paywall, shown while still signed out.
  await shareLater.tap();
  await screen.getByRole("button", "I'm in").tap({ timeout: 30_000 });
  await expectPaywall(screen);

  // A close is a decline. Signed out there is no exit offer, and the one
  // sign-in follows.
  await screen.getByRole("button").first().tap();
  await expect(screen.getByRole("button", "Restore Purchases")).toBeHidden({
    timeout: 30_000,
  });
  await signInAfterOnboarding(screen);
});
