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

// A page from the fixtures in apps/native/convex/model/fakeAi.ts. Only a
// backend running the fake model serves it, so the flow runs only where the
// e2e job turns the fake on; save-link.e2e.ts covers a real page and model.
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
    // As in save-note: wait out the sheet's close before tapping a tab under it.
    await expect(screen.getByTestId("add-article-input")).toBeHidden({
      timeout: 30_000,
    });
    await new Promise((resolve) => setTimeout(resolve, SHEET_TRANSITION_MS));

    // "membrillo" is only in the fixture page's description and text, so the
    // search answers once the page was read and classified, and the fake
    // keeps the page's own title.
    const search = screen.getByRole("textbox", "Search your saves");
    await tapTab(screen, "Search", search);
    await fillField(search, "membrillo");
    await expect(
      screen.getByRole("button", new RegExp(`^${TITLE}`)),
    ).toHaveCount(1, { timeout: 60_000 });
  },
);
