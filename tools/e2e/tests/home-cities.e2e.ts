import { test } from "@e2e-dev/mobile";
import { expect } from "e2e";

import { startOnSeededHome } from "./seeded-home.ts";

startOnSeededHome();

test("opens Home on the seeded cities", async ({ screen }) => {
  await expect(screen.getByText("Your cities")).toBeVisible({
    timeout: 30_000,
  });
  // The seeded save has no map pins: the city stays visible without a zero count.
  const lisbon = screen.getByRole("button", /^Lisbon$/);
  await expect(lisbon).toBeVisible();
  await expect(screen.getByText("0 places")).toBeHidden();
  await lisbon.tap();
  await expect(screen.getByRole("button", "Belém Tower")).toBeVisible();
  await expect(screen.getByText("0 places from your saves")).toBeHidden();
});

test("searches saved places from Home and clears back to cities", async ({
  app,
  screen,
}) => {
  const search = screen.getByLabel("Search your saves");
  await expect(search).toBeVisible();
  await app.screenshot("home-search-field");
  await search.fill("Lisbon");
  const result = screen.getByRole("button", /^Belém Tower/);
  await expect(result).toBeVisible();
  await expect(screen.getByText("Your cities")).toBeHidden();
  await app.screenshot("home-search-results");
  await search.fill("NoSuchSavedPlace");
  await expect(
    screen.getByText("No saves match “NoSuchSavedPlace”."),
  ).toBeVisible();
  await app.screenshot("home-search-no-results");
  await screen.getByRole("button", "Clear search").tap();
  await expect(screen.getByText("Your cities")).toBeVisible();
  await search.fill("Belém");
  await expect(result).toBeVisible();
  await result.tap();
  await expect(search).toBeHidden();
  await expect(screen.getByText("Belém Tower")).toBeVisible();
});
