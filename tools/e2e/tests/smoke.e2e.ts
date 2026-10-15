import { test } from "@e2e-dev/mobile";
import { expect } from "e2e";

import { startOnSeededHome } from "./seeded-home.ts";

startOnSeededHome();

// The doctor for .agents/skills/verify-shelvr: the app starts, the dev user
// signs in, the fixture reset runs, and Home lists a seeded save. No model.
test("opens Home with the seeded saves", async ({ screen }) => {
  await expect(screen.getByTestId("fixture-item-ramen")).toBeVisible({
    timeout: 30_000,
  });
});
