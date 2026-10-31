import { test } from "@e2e-dev/mobile";
import { expect } from "e2e";
import { startOnSeededHome } from "./seeded-home.ts";

startOnSeededHome();

test("opens saved-place corrections and saves the chosen places", async ({
  screen,
  app,
}) => {
  await screen.getByLabel("Search your saves").fill("Belém");
  await screen.getByRole("button", /^Belém Tower/).tap();
  await screen.getByRole("link", "Edit places").tap();
  await expect(screen.getByLabel("City")).toBeVisible();
  await app.screenshot("edit-save-places");
  await screen.getByRole("button", "Save places").tap();
  await expect(screen.getByRole("link", "Edit places")).toBeVisible();
});

test(
  "adds, replaces and removes a place using live Apple Maps search",
  {
    skip:
      process.env.E2E_LIVE_MAPS !== "true" &&
      "requires live Apple Maps on the development backend",
  },
  async ({ screen, app }) => {
    await screen.getByLabel("Search your saves").fill("Belém");
    await screen.getByRole("button", /^Belém Tower/).tap();
    await screen.getByRole("link", "Edit places").tap();
    await screen.getByLabel("City").fill("Lisbon");
    await screen.getByTestId("place-correction-search").fill("Time Out Market");
    await screen.getByRole("button", "Search places").tap();
    const market = screen.getByRole("button", /Time Out Market/i).first();
    await expect(market).toBeVisible({ timeout: 30_000 });
    await app.screenshot("live-place-search-results");
    await market.tap();
    await screen.getByRole("button", "Save places").tap();
    await screen.getByRole("link", "Edit places").tap();
    await expect(screen.getByText(/Time Out Market/i)).toBeVisible();
    await app.screenshot("live-place-added-and-persisted");
    await screen.getByRole("button", "Replace place").tap();
    await screen
      .getByTestId("place-correction-search")
      .fill("Jerónimos Monastery");
    await screen.getByRole("button", "Search places").tap();
    const monastery = screen.getByRole("button", /Jer.nimos/i).first();
    await expect(monastery).toBeVisible({ timeout: 30_000 });
    await monastery.tap();
    await screen.getByRole("button", "Save places").tap();
    await screen.getByRole("link", "Edit places").tap();
    await expect(screen.getByText(/Jer.nimos/i)).toBeVisible();
    await expect(screen.getByText(/Time Out Market/i)).toBeHidden();
    await app.screenshot("live-place-replaced-and-persisted");
    await screen.getByRole("button", "Remove").tap();
    await screen.getByRole("button", "Save places").tap();
    await screen.getByRole("link", "Edit places").tap();
    await expect(screen.getByRole("button", "Remove")).toBeHidden();
    await app.screenshot("live-place-removal-persisted");
  },
);
