import { test } from "@e2e-dev/mobile";
import { expect } from "e2e";

import { startFreshOnboarding, walkToFirstSave } from "./fresh-onboarding.ts";

// A first-time user who skips the first save and practises sharing instead:
// the share goes through the real iOS share sheet to the Shelvr extension,
// waits out onboarding and sign-in, and is saved by the share screen. That
// first share is what tells Home the person already knows how to share, so
// its how-to card stays away (PR #87 saved a share without saying so, and
// Home taught sharing seconds after it).
test("saves the practice share and skips the how-to on Home", async ({
  app,
  device,
  screen,
}) => {
  await startFreshOnboarding({ app, device, screen });
  await walkToFirstSave(screen);
  // No first save, so the reminder step skips itself.
  await screen.getByRole("button", "Skip for now").tap();

  await screen
    .getByRole("button", /^Share this post, /)
    .tap({ timeout: 30_000 });
  // The extension's tile in the share sheet's row of apps.
  await screen
    .getByRole("button", /^Shelvr/)
    .first()
    .tap({ timeout: 30_000 });
  await expect(screen.getByText("You nailed it.")).toBeVisible({
    timeout: 60_000,
  });
  // Signed out, so the way on reads as the Pro ask; nobody signed out is
  // shown the paywall.
  await screen
    .getByRole("button", /^(Go to my shelf|Keep saving with Pro)$/)
    .tap();

  // Onboarding is over and the account comes next.
  await screen.getByTestId("dev-login-button").tap({ timeout: 60_000 });

  const keepAi = screen.getByRole("button", "Keep it on");
  const howTo = screen.getByText("Save from anywhere.");
  const profile = screen.getByRole("button", "Profile");
  await expect
    .poll(
      async () => {
        if (await keepAi.isVisible()) await keepAi.tap();
        return (await profile.isVisible()) && !(await howTo.isVisible());
      },
      { timeout: 120_000 },
    )
    .toBe(true);
  // Still away once the save has settled, not only before the card renders.
  await new Promise((resolve) => setTimeout(resolve, 5000));
  await expect(howTo).toBeHidden();
});
