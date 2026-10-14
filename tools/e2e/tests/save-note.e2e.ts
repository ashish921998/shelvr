import { test } from "@e2e-dev/mobile";
import { expect } from "e2e";

import {
  tapTab,
  chooseAddOption,
  SHEET_TRANSITION_MS,
  startOnSeededHome,
} from "./seeded-home.ts";

startOnSeededHome();

const NOTE = "Ask the landlord about the quokka mural";

// The word below is in no seeded save, so only the new note can answer for
// it. The test makes no model call itself, but the backend does: a note's
// words reach the search index only once the model has processed it.
test("saves a note and finds it by its own words", async ({ screen }) => {
  await chooseAddOption(screen, screen.getByTestId("add-option-note"));
  await screen.getByTestId("add-note-input").fill(NOTE);
  await screen.getByRole("button", "Save").tap();
  // The tab bar stays in the tree under the Add sheet, and the tree has no
  // signal for a sheet that is still sliding away, so a tap sent the moment
  // the composer is gone lands on the sheet. Give the close the same second
  // the config gives an opening one.
  await expect(screen.getByTestId("add-note-input")).toBeHidden({
    timeout: 30_000,
  });
  await new Promise((resolve) => setTimeout(resolve, SHEET_TRANSITION_MS));

  await tapTab(screen, "Search");
  await screen.getByRole("textbox", "Search your saves").fill("quokka");

  // The model titles the note, so the result's label is not known ahead of
  // time. Once the search has answered, the result is the only button on the
  // screen that is not a search or keyboard control. Waiting for exactly one
  // means a stray button fails the flow here instead of being tapped.
  const result = screen.getByRole(
    "button",
    /^(?!(Clear text|Close|Emoji|Dictate)$).+/,
  );
  await expect(result).toHaveCount(1, { timeout: 60_000 });
  await result.tap();
  await expect(screen.getByRole("textbox", "Note text")).toHaveValue(NOTE, {
    timeout: 30_000,
  });
});
