import { test } from "@e2e-dev/mobile";
import { expect } from "e2e";

import { startOnSeededHome, tapUntilVisible } from "./seeded-home.ts";

startOnSeededHome();

test("takes a city off the Been list from Profile", async ({ app, screen }) => {
  const row = screen.getByRole("button", "Cities you’ve been to, 3 cities");
  await tapUntilVisible(screen.getByRole("button", "Profile"), row, {
    waitMs: 15_000,
    timeout: 60_000,
  });
  await row.tap();
  const madrid = screen.getByRole("checkbox", "Madrid");
  await expect(madrid).toBeChecked({ timeout: 30_000 });
  await app.screenshot("been-cities-editor");
  await madrid.tap();
  await expect(madrid).toBeChecked({ checked: false });
  await screen.getByRole("button", "Close").tap();
  await expect(
    screen.getByRole("button", "Cities you’ve been to, 2 cities"),
  ).toBeVisible({ timeout: 30_000 });
});
