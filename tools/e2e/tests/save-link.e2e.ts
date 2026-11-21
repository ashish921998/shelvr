import { test } from "@e2e-dev/mobile";
import { expect } from "e2e";

import { fillField, openAddSheet, startOnSeededHome } from "./seeded-home.ts";

startOnSeededHome();

test("saves a link and shows it on Home", async ({ agent, screen }) => {
  const input = await openAddSheet(screen);
  await fillField(input, "https://en.wikipedia.org/wiki/Sourdough");
  await screen.getByRole("button", "Save").tap();
  await expect(input).toBeHidden({ timeout: 30_000 });

  const review = screen.getByRole("button", /^Without a place(?:,|$)/);
  await expect(review).toBeVisible({ timeout: 60_000 });
  await review.tap();

  await agent.waitFor("The Without a place sheet lists the Sourdough page", {
    timeout: 120_000,
    vision: "only",
  });
});
