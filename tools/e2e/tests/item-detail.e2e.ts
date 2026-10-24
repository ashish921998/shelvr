import { test } from "@e2e-dev/mobile";
import { expect } from "e2e";

import {
  fillField,
  startOnSeededHome,
  tapUntilVisible,
} from "./seeded-home.ts";

startOnSeededHome();

test("opens a note and keeps an edit to its text", async ({ screen }) => {
  const card = screen.getByTestId("fixture-item-apartment-checklist");
  const text = screen.getByRole("textbox", "Note text");
  // The card starts under the floating tab bar, which refuses a tap on it.
  await screen.swipe({ direction: "down" });
  await tapUntilVisible(card, text, { waitMs: 5000, timeout: 60_000 });
  await expect(text).toHaveValue("Lamp, shelves, linen, and a reading chair.");

  const edited = `Lamp, shelves, and a rug ${Date.now()}`;
  await fillField(text, edited);
  await screen.getByTestId("BackButton").tap();
  // Until the page is gone, its field still reads as visible and a reopen would not remount it.
  await expect(text).toBeHidden({ timeout: 30_000 });
  await expect(card).toBeVisible({ timeout: 30_000 });

  await tapUntilVisible(card, text, { waitMs: 5000, timeout: 60_000 });
  await expect(text).toHaveValue(edited, { timeout: 30_000 });
});
