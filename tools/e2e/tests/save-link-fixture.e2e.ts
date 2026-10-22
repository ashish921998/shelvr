import { test } from "@e2e-dev/mobile";
import { expect } from "e2e";

import {
  chooseAddOption,
  fillField,
  SHEET_TRANSITION_MS,
  startOnSeededHome,
  tapTab,
} from "./seeded-home.ts";

startOnSeededHome();

const FIXTURE_URL = "https://fixtures.e2e.invalid/quince-paste";
const TITLE = "Quince paste for beginners";

test(
  "saves a link and finds it by its page's words",
  {
    skip:
      process.env.E2E_FAKE_AI !== "local-v1" &&
      "needs the e2e job's local backend, which runs the fake model",
  },
  async ({ screen }) => {
    await chooseAddOption(screen, screen.getByTestId("add-option-article"));
    await fillField(screen.getByTestId("add-article-input"), FIXTURE_URL);
    await screen.getByRole("button", "Save").tap();
    await expect(screen.getByTestId("add-article-input")).toBeHidden({
      timeout: 30_000,
    });
    await new Promise((resolve) => setTimeout(resolve, SHEET_TRANSITION_MS));

    const search = screen.getByRole("textbox", "Search your saves");
    await tapTab(screen, "Search", search);
    await fillField(search, "membrillo");
    await expect(
      screen.getByRole("button", new RegExp(`^${TITLE}`)),
    ).toHaveCount(1, { timeout: 60_000 });
  },
);
