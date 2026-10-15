import { test } from "@e2e-dev/mobile";
import { expect } from "e2e";

import {
  shareLinkIntoApp,
  signInAndSaveFirst,
  startFreshOnboarding,
  walkToFirstSave,
} from "./fresh-onboarding.ts";

// A first-time user whose first save is a link shared into Shelvr from
// another app while the first-save step waits for one. That share is what
// tells Home the person already knows how to share, so the how-to card stays
// away (PR #87 saved the shared demo link without saying so, and Home taught
// sharing seconds after it).
test("remembers a shared first save and skips the share how-to on Home", async ({
  device,
  screen,
}) => {
  await startFreshOnboarding({ device, screen });
  await walkToFirstSave(screen);
  await shareLinkIntoApp(device, screen, "https://example.com/");
  await signInAndSaveFirst(screen);
  await screen.getByRole("button", "Don't remind me").tap();
  // The dev user is Pro, so leaving the practice goes straight to Home.
  await screen.getByRole("button", "I'll try it later").tap({
    timeout: 30_000,
  });

  // The save progress card counts real saves only, so it is up and has
  // loaded once Home shows 0 of them.
  const keepAi = screen.getByRole("button", "Keep it on");
  const progress = screen.getByLabel(/^0 of \d+ saved$/);
  await expect
    .poll(
      async () => {
        if (await keepAi.isVisible()) await keepAi.tap();
        return progress.isVisible();
      },
      { timeout: 120_000 },
    )
    .toBe(true);

  // That card stands in for the how-to while it is up, so it is put away
  // first: only the first-share flag keeps the how-to from taking its place.
  // The card's controls sit beside it in the accessibility tree, not in it.
  await screen.getByRole("button", "Not now").tap();
  await expect(progress).toBeHidden({ timeout: 10_000 });
  await expect(screen.getByRole("button", "Profile")).toBeVisible();
  await expect(screen.getByText("Save from anywhere.")).toBeHidden();
});
