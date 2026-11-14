import { test } from "@e2e-dev/mobile";
import { expect } from "e2e";

import { startOnSeededHome, tapUntilVisible } from "./seeded-home.ts";

startOnSeededHome();

test("takes a city stamp off the passport", async ({ app, screen }) => {
  const madrid = screen.getByRole("button", "Madrid, city stamp");
  await tapUntilVisible(screen.getByRole("button", "Passport"), madrid, {
    waitMs: 15_000,
    timeout: 60_000,
  });
  await expect(screen.getByTestId("passport-city-stamps")).toBeVisible();
  await app.screenshot("passport-city-stamps");
  await madrid.tap();
  await screen.getByRole("button", "Remove stamp").tap();
  await expect(madrid).toBeHidden({ timeout: 30_000 });
  await expect(screen.getByRole("button", "Lisbon, city stamp")).toBeVisible();
});
