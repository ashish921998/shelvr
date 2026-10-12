import { test } from "@e2e-dev/mobile";
import { expect } from "e2e";

import { SHEET_TRANSITION_MS, startOnSeededHome } from "./seeded-home.ts";

startOnSeededHome();

const NOTE = "Ask the landlord about the quokka mural";

// A note's own words are searchable, so the check needs no model: the word
// below is in no seeded save, and only the new note can answer for it.
test("saves a note and finds it by its own words", async ({ screen }) => {
  await screen.getByRole("button", "Add").tap();
  await screen.getByTestId("add-option-note").tap();
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

  await screen.getByRole("tab", "Search").tap();
  await screen.getByRole("textbox", "Search your saves").fill("quokka");

  // The model titles the note, so the result's label is not known ahead of
  // time. It is the first button on the screen that is not a search or
  // keyboard control, and opening it shows the words that were typed.
  await screen
    .getByRole("button", /^(?!(Clear text|Close|Emoji|Dictate)$).+/)
    .first()
    .tap({ timeout: 60_000 });
  await expect(screen.getByRole("textbox", "Note text")).toHaveValue(NOTE, {
    timeout: 30_000,
  });
});
