import { test } from "@e2e-dev/mobile";
import { expect } from "e2e";

import { startOnSeededHome } from "./seeded-home.ts";

startOnSeededHome();

test(
  "selects a trip destination day on the first tap with the search keyboard open",
  {
    skip:
      process.env.E2E_LIVE_MAPS !== "true" &&
      "needs a development backend with Apple Maps configured",
  },
  async ({ screen, app }) => {
    await screen.getByRole("button", /^Lisbon(?:,|$)/).tap();
    await screen.getByRole("button", "Plan a trip").tap();
    await screen.getByTestId("new-trip-submit").tap();
    await expect(screen.getByRole("button", "More")).toBeVisible({
      timeout: 60_000,
    });
    await screen.getByRole("button", "More").tap();
    await screen.getByRole("button", "Add a place").tap();
    const input = screen.getByTestId("add-trip-stop-search");
    await input.fill("Jeronimos");
    await input.tap();
    await app.screenshot("keyboard-before-day-selection");
    const unplanned = screen.getByRole("radio", "Unplanned");
    await unplanned.tap();
    await expect(unplanned).toBeChecked();
    await app.screenshot("first-tap-day-selected");
  },
);
