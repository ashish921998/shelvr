import { test } from "@e2e-dev/mobile";
import { expect } from "e2e";

import { startOnSeededHome, tapTab } from "./seeded-home.ts";

startOnSeededHome();

test("says so when no save matches the search", async ({ screen }) => {
  await tapTab(screen, "Search");
  await screen.getByRole("textbox", "Search your saves").fill("zzyzxq");

  await expect(screen.getByText("Nothing yet")).toBeVisible({
    timeout: 30_000,
  });
  for (const seeded of [
    "ramen",
    "belem-tower",
    "apartment-checklist",
    "value-of-craft",
  ]) {
    await expect(screen.getByTestId(`fixture-item-${seeded}`)).toBeHidden();
  }
});
