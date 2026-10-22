import { test } from "@e2e-dev/mobile";
import { expect } from "e2e";

import { startOnSeededHome } from "./seeded-home.ts";

startOnSeededHome();

test("opens Home with the seeded saves", async ({ screen }) => {
  await expect(screen.getByTestId("fixture-item-ramen")).toBeVisible({
    timeout: 30_000,
  });
});
