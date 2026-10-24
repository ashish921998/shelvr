import { test } from "@e2e-dev/mobile";
import { expect } from "e2e";

import { fillField, openAddSheet, startOnSeededHome } from "./seeded-home.ts";

startOnSeededHome();

const FIXTURE_URL = "https://fixtures.e2e.invalid/lisbon-date-night";
const TITLE = "Date night in Lisbon";
const FIRST_PLACE = "Taberna da Rua das Flores";

test(
  "saves a Lisbon page, finds it under Lisbon and plans a date from it",
  {
    skip:
      process.env.E2E_FAKE_AI !== "local-v1" &&
      "needs the e2e job's local backend, which runs the fake model",
  },
  async ({ screen }) => {
    const input = await openAddSheet(screen);
    await fillField(input, FIXTURE_URL);
    await screen.getByRole("button", "Save").tap();
    await expect(input).toBeHidden({ timeout: 30_000 });

    await screen.getByRole("button", /^Lisbon,/).tap();
    await expect(screen.getByText(TITLE)).toBeVisible({ timeout: 60_000 });

    await screen.getByRole("button", "Plan a date").tap();
    await expect(screen.getByText("Your shortlist")).toBeVisible({
      timeout: 60_000,
    });
    await expect(
      screen.getByRole("button", new RegExp(`^${FIRST_PLACE}`)),
    ).toBeVisible({ timeout: 30_000 });
  },
);
