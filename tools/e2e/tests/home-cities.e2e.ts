import { test } from "@e2e-dev/mobile";
import { expect, type Screen } from "e2e";

import { pollUntil } from "./poll.ts";
import { fillField, startOnSeededHome } from "./seeded-home.ts";

startOnSeededHome();

test("opens Home on the seeded cities", async ({ screen }) => {
  await expect(screen.getByRole("button", /^Lisbon/)).toBeVisible({
    timeout: 30_000,
  });
  // The seeded save has no map pins: the city stays visible without a zero count.
  const lisbon = screen.getByRole("button", /^Lisbon/);
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
  await expect(screen.getByRole("button", /^Lisbon/)).toBeVisible({
    timeout: 30_000,
  });
  await app.screenshot("home-search-field");
  await searchFor(screen, "Lisbon");
  const result = screen.getByRole("button", /^Belém Tower/);
  await expect(result).toBeVisible();
  await expect(screen.getByRole("button", /^Lisbon/)).toBeHidden();
  await app.screenshot("home-search-results");
  await searchFor(screen, "NoSuchSavedPlace");
  await expect(
    screen.getByText("No saves match “NoSuchSavedPlace”."),
  ).toBeVisible();
  await app.screenshot("home-search-no-results");
  await screen.getByRole("button", "Clear search").tap();
  await expect(screen.getByRole("button", /^Lisbon/)).toBeVisible();
  await searchFor(screen, "Belém");
  await expect(result).toBeVisible();
  await result.tap();
  await expect(search).toBeHidden();
  await expect(screen.getByText("Belém Tower")).toBeVisible();
});

async function searchFor(screen: Screen, query: string): Promise<void> {
  const search = screen.getByLabel("Search your saves");
  const clear = screen.getByRole("button", "Clear search");
  await pollUntil(
    async () => {
      if (await clear.isVisible()) {
        await clear.tap();
        await expect(clear).toBeHidden();
      }
      await fillField(search, query);
      return expect(search)
        .toHaveValue(query, { timeout: 2000 })
        .then(
          () => true,
          () => false,
        );
    },
    { timeout: 60_000 },
  );
}
