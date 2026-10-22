import { test } from "@e2e-dev/mobile";
import { expect } from "e2e";

import {
  SHEET_TRANSITION_MS,
  startOnSeededHome,
  tapTab,
  tapUntilVisible,
  fillField,
} from "./seeded-home.ts";

// The one CI flow that still resets through Settings, so that path stays
// covered while the rest reset from the backend.
startOnSeededHome({ reset: "settings" });

test("creates a space", async ({ screen }) => {
  const name = `Pilot ${Date.now()}`;

  const newSpace = screen.getByRole("button", "New space");
  await tapTab(screen, "Spaces", newSpace);
  // "New space" has been tapped and its form never opened, once before #351
  // and once after, with no cause found.
  const field = screen.getByRole("textbox");
  await tapUntilVisible(newSpace, field, {
    waitMs: 5000,
    timeout: 60_000,
  });
  // The form is a sheet, and text typed while it is still rising can miss the
  // field: the runner then cannot confirm the field holds it (seen on CI).
  await new Promise((resolve) => setTimeout(resolve, SHEET_TRANSITION_MS));
  await fillField(field, name);
  // The app gives this control a label but no button role.
  await screen.getByLabel("Create space").tap();

  // The name also sits in the form's text field, so look for the button the
  // Spaces list shows once the space exists.
  await expect(screen.getByRole("button", name)).toBeVisible({
    timeout: 30_000,
  });
});
