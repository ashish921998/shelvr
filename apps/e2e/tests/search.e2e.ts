import { test } from "@e2e-dev/mobile";
import { expect } from "e2e";

import { startOnSeededHome } from "./seeded-home.ts";

startOnSeededHome();

test("finds a save by a word in its title", async ({ agent, screen }) => {
  await agent.act("go to the Search tab and search your saves for {query}", {
    params: { query: "ramen" },
  });

  await expect(screen.getByText("Weeknight Miso Ramen")).toBeVisible({
    timeout: 30_000,
  });
  await expect(screen.getByText("Belém Tower")).toBeHidden();
});
