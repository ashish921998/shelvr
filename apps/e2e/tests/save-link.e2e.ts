import { test } from "@e2e-dev/mobile";

import { startOnSeededHome } from "./seeded-home.ts";

startOnSeededHome();

test("saves a link as an article", async ({ agent }) => {
  await agent.act("add a new Article save for the link {url} and save it", {
    params: { url: "https://example.com" },
  });

  // The backend fetches the page and an LLM titles it, so the card's wording
  // is not fixed.
  await agent.waitFor("Home shows a save for example.com or 'Example Domain'", {
    timeout: 120_000,
  });
});
