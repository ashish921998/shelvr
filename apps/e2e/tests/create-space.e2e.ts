import { test } from "@e2e-dev/mobile";
import { expect, unique } from "e2e";

import { startOnSeededHome } from "./seeded-home.ts";

startOnSeededHome();

test("creates a space", async ({ agent, screen }) => {
  const name = `Pilot ${Date.now()}`;

  await agent.act("go to the Spaces tab and create a new space named {name}", {
    params: { name: unique(name) },
  });

  // The name also sits in the form's text field, so look for the button the
  // Spaces list shows once the space exists.
  await expect(screen.getByRole("button", name)).toBeVisible({
    timeout: 30_000,
  });
});
