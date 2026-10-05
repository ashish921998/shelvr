import { test } from "@e2e-dev/mobile";
import { expect } from "e2e";

import { startOnSeededHome } from "./seeded-home.ts";

startOnSeededHome();

test("finds a save by a word in its title", async ({ agent, screen }) => {
  await agent.act("go to the Search tab and search your saves for {query}", {
    params: { query: "ramen" },
  });

  await expect(screen.getByRole("textbox", "Search your saves")).toHaveValue(
    "ramen",
  );
  // Save cards are missing from the iOS accessibility tree, so only a
  // screenshot can tell which results came back.
  await agent.assert(
    'the results show exactly one save, titled "Weeknight Miso Ramen", and no "Belém Tower"',
    { vision: "only" },
  );
});
