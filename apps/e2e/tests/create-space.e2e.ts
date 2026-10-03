import { test } from "@e2e-dev/mobile";
import { expect, unique } from "e2e";

import { startOnSeededHome } from "./seeded-home.ts";

startOnSeededHome();

test("creates a space", async ({ agent, screen }) => {
  const name = `Pilot ${Date.now()}`;

  await agent.act("go to the Spaces tab and create a new space named {name}", {
    params: { name: unique(name) },
  });

  await expect(screen.getByText(name)).toBeVisible({ timeout: 30_000 });
});
