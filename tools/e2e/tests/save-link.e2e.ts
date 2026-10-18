import { test } from "@e2e-dev/mobile";

import {
  chooseAddOption,
  fillField,
  startOnSeededHome,
} from "./seeded-home.ts";

startOnSeededHome();

// Every control on this path is in the accessibility tree, so the steps are
// plain locators and only the result needs a model.
test("saves a link as an article", async ({ agent, screen }) => {
  await chooseAddOption(screen, screen.getByTestId("add-option-article"));
  await fillField(
    screen.getByTestId("add-article-input"),
    "https://en.wikipedia.org/wiki/Sourdough",
  );
  await screen.getByRole("button", "Save").tap();

  // The backend reads the page and an LLM titles it, so the card's wording,
  // and with it the card's label, is not fixed.
  await agent.waitFor(
    "Home shows exactly one finished save about sourdough from wikipedia.org",
    {
      timeout: 120_000,
      vision: "only",
    },
  );
});
