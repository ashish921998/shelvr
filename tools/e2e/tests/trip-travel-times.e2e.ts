import { test } from "@e2e-dev/mobile";
import { expect } from "e2e";
import { startOnSeededHome } from "./seeded-home.ts";

startOnSeededHome();

test(
  "shows live walking and driving times between trip stops",
  {
    skip:
      process.env.E2E_LIVE_MAPS !== "true" &&
      "needs live Apple Maps on the development backend",
  },
  async ({ screen, app }) => {
    await screen.getByRole("button", /^Lisbon(?:,|$)/).tap();
    await screen.getByRole("button", "Plan a trip").tap();
    await screen.getByTestId("new-trip-submit").tap();
    const walking = screen.getByRole("radio", "Walking");
    await expect(walking).toBeVisible({ timeout: 60_000 });
    await expect(walking).toBeChecked();
    await expect(
      screen.getByRole("button", /^Walking:.*~\d+ min/).first(),
    ).toBeVisible({ timeout: 45_000 });
    await app.screenshot("trip-walking-times");
    await screen.getByRole("radio", "Driving").tap();
    await expect(screen.getByRole("radio", "Driving")).toBeChecked();
    await expect(
      screen.getByRole("button", /^Driving:.*~\d+ min/).first(),
    ).toBeVisible({ timeout: 45_000 });
    await app.screenshot("trip-driving-times");
  },
);
