import { test } from "@e2e-dev/mobile";

import {
  chooseAddOption,
  fillField,
  startOnSeededHome,
} from "./seeded-home.ts";

startOnSeededHome();

test("saves a link as an article", async ({ agent, screen }) => {
  await chooseAddOption(screen, screen.getByTestId("add-option-article"));
  await fillField(
    screen.getByTestId("add-article-input"),
    "https://en.wikipedia.org/wiki/Sourdough",
  );
  await screen.getByRole("button", "Save").tap();

  await agent.waitFor(
    "Home shows exactly one finished save about sourdough from wikipedia.org",
    {
      timeout: 120_000,
      vision: "only",
    },
  );
});
