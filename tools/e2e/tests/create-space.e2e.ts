import { test } from "@e2e-dev/mobile";
import { expect } from "e2e";

import { startOnSeededHome, tapTab, tapUntilVisible } from "./seeded-home.ts";

startOnSeededHome();

test("creates a space", async ({ screen }) => {
  const name = `Pilot ${Date.now()}`;

  await tapTab(screen, "Spaces");
  // "New space" has been tapped and its form never opened, once before #351
  // and once after, with no cause found.
  const field = screen.getByRole("textbox");
  await tapUntilVisible(screen.getByRole("button", "New space"), field, {
    waitMs: 5000,
    timeout: 60_000,
  });
  await field.fill(name);
  // The app gives this control a label but no button role.
  await screen.getByLabel("Create space").tap();

  // The name also sits in the form's text field, so look for the button the
  // Spaces list shows once the space exists.
  await expect(screen.getByRole("button", name)).toBeVisible({
    timeout: 30_000,
  });
});
