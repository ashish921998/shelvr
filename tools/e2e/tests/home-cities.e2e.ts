import { test } from "@e2e-dev/mobile";
import { expect } from "e2e";

import { openCities, startOnSeededHome } from "./seeded-home.ts";

startOnSeededHome();

test("opens the seeded cities from Home", async ({ screen }) => {
  await openCities(screen);
  // The seeded save has no map pins: the city stays visible without a zero count.
  const lisbon = screen.getByRole("button", /^Lisbon/);
  await expect(lisbon).toBeVisible({ timeout: 30_000 });
  await expect(screen.getByText("0 places")).toBeHidden();
  await lisbon.tap();
  await expect(screen.getByRole("button", "Belém Tower")).toBeVisible();
  await expect(screen.getByText("0 places from your saves")).toBeHidden();
});

test("searches saved places from Home and clears back to its rows", async ({
  app,
  screen,
}) => {
  const search = screen.getByTestId("home-search-input");
  const clear = screen.getByRole("button", "Clear search");
  await expect(search).toBeVisible();
  await app.screenshot("home-search-field");
  await search.tap();
  await search.fill("Lisbon");
  const result = screen.getByRole("button", /^Belém Tower/);
  await expect(result).toBeVisible();
  const cities = screen.getByRole("button", /^Cities(?:,|$)/);
  await expect(cities).toBeHidden();
  await app.screenshot("home-search-results");
  await clear.tap();
  await expect(clear).toBeHidden();
  await search.tap();
  await search.fill("NoSuchSavedPlace");
  await expect(
    screen.getByText("No saves match “NoSuchSavedPlace”."),
  ).toBeVisible();
  await app.screenshot("home-search-no-results");
  await clear.tap();
  await expect(cities).toBeVisible();
  await search.tap();
  await search.fill("Belém");
  await expect(result).toBeVisible();
  await result.tap();
  await expect(search).toBeHidden();
  await expect(screen.getByText("Belém Tower")).toBeVisible();
});
