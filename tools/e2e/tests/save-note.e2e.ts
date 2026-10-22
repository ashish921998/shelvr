import { test } from "@e2e-dev/mobile";
import { expect } from "e2e";

import {
  tapTab,
  chooseAddOption,
  SHEET_TRANSITION_MS,
  startOnSeededHome,
  fillField,
} from "./seeded-home.ts";

startOnSeededHome();

const NOTE = "Ask the landlord about the quokka mural";

test("saves a note and finds it by its own words", async ({ screen }) => {
  await chooseAddOption(screen, screen.getByTestId("add-option-note"));
  await fillField(screen.getByTestId("add-note-input"), NOTE);
  await screen.getByRole("button", "Save").tap();
  await expect(screen.getByTestId("add-note-input")).toBeHidden({
    timeout: 30_000,
  });
  await new Promise((resolve) => setTimeout(resolve, SHEET_TRANSITION_MS));

  const search = screen.getByRole("textbox", "Search your saves");
  await tapTab(screen, "Search", search);
  await fillField(search, "quokka");

  const result = screen.getByRole(
    "button",
    /^(?!(Clear text|Close|Emoji|Dictate|shift|search)$).+/,
  );
  await expect(result).toHaveCount(1, { timeout: 60_000 });
  await result.tap();
  await expect(screen.getByRole("textbox", "Note text")).toHaveValue(NOTE, {
    timeout: 30_000,
  });
});
