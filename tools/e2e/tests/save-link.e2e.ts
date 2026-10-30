import { test } from "@e2e-dev/mobile";

import { fillField, openAddSheet, startOnSeededHome } from "./seeded-home.ts";

startOnSeededHome();

test("saves a link and shows it on Home", async ({ agent, screen }) => {
  const input = await openAddSheet(screen);
  await fillField(input, "https://en.wikipedia.org/wiki/Sourdough");
  await screen.getByRole("button", "Save").tap();

  await agent.waitFor(
    "Home says a save has no place, with a Review link under the cities",
    { timeout: 120_000, vision: "only" },
  );
});
