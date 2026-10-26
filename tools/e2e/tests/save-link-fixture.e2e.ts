import { test } from "@e2e-dev/mobile";
import { expect } from "e2e";

import { fillField, openAddSheet, startOnSeededHome } from "./seeded-home.ts";

startOnSeededHome();

const FIXTURE_URL = "https://fixtures.e2e.invalid/quince-paste";
const TITLE = "Quince paste for beginners";

test(
  "saves a link that names no place and lists it under No place found",
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

    await expect(
      screen.getByRole("button", `${TITLE}, No place found`),
    ).toHaveCount(1, { timeout: 60_000 });
  },
);
