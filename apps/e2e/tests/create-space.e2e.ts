import { test } from "@e2e-dev/mobile";
import { expect } from "e2e";

import { startOnSeededHome } from "./seeded-home.ts";

startOnSeededHome();

test("creates a space", async ({ screen }) => {
  const name = `Pilot ${Date.now()}`;

  await screen.getByRole("tab", "Spaces").tap();
  await screen.getByRole("button", "New space").tap();
  await screen.getByRole("textbox").fill(name);
  // The app gives this control a label but no button role.
  await screen.getByLabel("Create space").tap();

  // The name also sits in the form's text field, so look for the button the
  // Spaces list shows once the space exists.
  await expect(screen.getByRole("button", name)).toBeVisible({
    timeout: 30_000,
  });
});
