import { test } from "@e2e-dev/mobile";
import { expect } from "e2e";

import { fillField, startOnSeededHome, tapTab } from "./seeded-home.ts";

startOnSeededHome();

test("finds a save by a word in its title", async ({ screen }) => {
  await tapTab(screen, "Search");
  await fillField(screen.getByRole("textbox", "Search your saves"), "ramen");

  // The query is debounced and runs on the backend, so the toBeVisible wait
  // covers the round trip. Then none of the other seeded saves may show.
  await expect(screen.getByTestId("fixture-item-ramen")).toBeVisible({
    timeout: 30_000,
  });
  for (const other of [
    "belem-tower",
    "apartment-checklist",
    "value-of-craft",
  ]) {
    await expect(screen.getByTestId(`fixture-item-${other}`)).toBeHidden();
  }
});
