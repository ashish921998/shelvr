import { test } from "@e2e-dev/mobile";
import { expect } from "e2e";

import { fillField, openAddSheet, startOnSeededHome } from "./seeded-home.ts";

startOnSeededHome();

const FIXTURE_URL = "https://fixtures.e2e.invalid/quince-paste";
const TITLE = "Quince paste for beginners";

test(
  "saves a link that names no place and offers it for review under the cities",
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

    const review = screen.getByRole(
      "button",
      /saves? without a place, Review$/,
    );
    await expect(review).toBeVisible({ timeout: 60_000 });
    await review.tap();

    await expect(
      screen.getByRole(
        "button",
        new RegExp(`^${TITLE}, .*No place in this one$`),
      ),
    ).toHaveCount(1);
  },
);
