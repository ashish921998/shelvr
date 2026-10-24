import { test } from "@e2e-dev/mobile";
import { expect } from "e2e";

import { startOnSeededHome } from "./seeded-home.ts";

startOnSeededHome();

test("opens Home on the seeded cities", async ({ screen }) => {
  await expect(screen.getByText("Your cities")).toBeVisible({
    timeout: 30_000,
  });
  await expect(screen.getByRole("button", /^Lisbon,/)).toBeVisible();
});
