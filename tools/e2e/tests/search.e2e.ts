import { test } from "@e2e-dev/mobile";
import { expect } from "e2e";

import { fillField, startOnSeededHome, tapTab } from "./seeded-home.ts";

startOnSeededHome();

test("finds a save by a word in its title", async ({ screen }) => {
  const search = screen.getByRole("textbox", "Search your saves");
  await tapTab(screen, "Search", search);
  await fillField(search, "ramen");

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
