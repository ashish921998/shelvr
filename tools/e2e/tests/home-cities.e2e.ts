import { test } from "@e2e-dev/mobile";
import { expect } from "e2e";

import { startOnSeededHome } from "./seeded-home.ts";

startOnSeededHome();

test("opens Home on the seeded cities", async ({ screen }) => {
  await expect(screen.getByText("Your cities")).toBeVisible({
    timeout: 30_000,
  });
  // The seeded save has no map pins: the city stays visible without a zero count.
  const lisbon = screen.getByRole("button", /^Lisbon$/);
  await expect(lisbon).toBeVisible();
  await expect(screen.getByText("0 places")).toBeHidden();
  await lisbon.tap();
  await expect(screen.getByRole("button", "Belém Tower")).toBeVisible();
  await expect(screen.getByText("0 places from your saves")).toBeHidden();
});
