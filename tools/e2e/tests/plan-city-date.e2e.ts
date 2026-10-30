import { test } from "@e2e-dev/mobile";
import { expect } from "e2e";

import { fillField, openAddSheet, startOnSeededHome } from "./seeded-home.ts";

startOnSeededHome();

const FIXTURE_URL = "https://fixtures.e2e.invalid/lisbon-date-night";
const TITLE = "Date night in Lisbon";

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

    await screen.getByRole("button", /^Lisbon(?:,|$)/).tap();
    await expect(screen.getByText(TITLE)).toBeVisible({ timeout: 60_000 });

    await screen.getByRole("button", "Plan a date").tap();
    await expect(screen.getByText("What kind of date?")).toBeVisible({
      timeout: 30_000,
    });
    await screen.getByRole("button", /^Classic(?:,|$)/).tap();
    // The local backend has no Apple Maps key, so the saves carry no pins and
    // the planner answers with its empty state: this proves the round trip
    // (Pro, rate limit, the city's saves) without a map.
    await expect(screen.getByText("Nothing saved for this yet")).toBeVisible({
      timeout: 60_000,
    });
  },
);
