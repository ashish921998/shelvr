import { test } from "@e2e-dev/mobile";
import { expect } from "e2e";

import { startOnSeededHome } from "./seeded-home.ts";

startOnSeededHome();

test("removes duplicate places, restores with Undo, and keeps removal after relaunch", async ({
  app,
  screen,
}) => {
  const austin = screen.getByRole("button", /^Austin(?:,|$)/);
  await expect(austin).toBeVisible();
  await austin.tap();
  const coffee = screen.getByRole("button", "Jo's Coffee");
  const other = screen.getByRole("button", "Houndstooth Coffee");
  await expect(coffee).toBeVisible();
  await expect(other).toBeVisible();
  await expect(
    screen.getByTestId("AnnotationContainer").getByLabel("Jo's Coffee"),
  ).toBeVisible();
  await coffee.tap();
  const remove = screen.getByRole("button", "Remove Jo's Coffee");
  await expect(remove).toBeVisible();
  await app.screenshot("place-selected");
  await remove.tap();
  await expect(screen.getByText("Removed Jo's Coffee")).toBeVisible();
  await screen.getByRole("button", "Undo").tap();
  await expect(coffee).toBeVisible();
  await expect(
    screen.getByTestId("AnnotationContainer").getByLabel("Jo's Coffee"),
  ).toBeVisible();
  await app.screenshot("place-restored");

  await coffee.tap();
  await remove.tap();
  await expect(coffee).toBeHidden();
  await expect(other).toBeVisible();
  await app.screenshot("place-removed-source-preserved");
  await expect(
    screen.getByTestId("AnnotationContainer").getByLabel("Jo's Coffee"),
  ).toBeHidden();
  await expect(screen.getByRole("button", "Undo")).toBeHidden({
    timeout: 10_000,
  });
  const source = screen.getByRole("button", "Austin favorites");
  await expect(source).toBeVisible();
  await source.tap();
  await expect(
    screen.getByTestId("fixture-item-detail-austin-favorites"),
  ).toBeVisible();
  await expect(screen.getByRole("button", "View on example.com")).toBeVisible();
  await app.screenshot("source-save-preserved");

  await app.open();
  await expect(austin).toBeVisible({ timeout: 30_000 });
  await austin.tap();
  await expect(coffee).toBeHidden();
  await expect(other).toBeVisible();
  await expect(
    screen.getByTestId("AnnotationContainer").getByLabel("Jo's Coffee"),
  ).toBeHidden();
  await app.screenshot("removal-persists-after-relaunch");
});

test("keeps both consecutive removals recoverable with queued Undo", async ({
  app,
  screen,
}) => {
  await screen.getByRole("button", /^Austin(?:,|$)/).tap();
  const coffee = screen.getByRole("button", "Jo's Coffee");
  const other = screen.getByRole("button", "Houndstooth Coffee");
  await coffee.tap();
  await screen.getByRole("button", "Remove Jo's Coffee").tap();
  await expect(coffee).toBeHidden();
  await expect(other).toBeVisible();
  await other.tap();
  await screen.getByRole("button", "Remove Houndstooth Coffee").tap();
  await expect(coffee).toBeHidden();
  await expect(other).toBeHidden();
  await expect(screen.getByText("Removed Jo's Coffee")).toBeVisible();
  await screen.getByRole("button", "Undo").tap();
  await expect(coffee).toBeVisible();
  await expect(screen.getByText("Removed Houndstooth Coffee")).toBeVisible();
  await screen.getByRole("button", "Undo").tap();
  await expect(other).toBeVisible();
  await expect(screen.getByRole("button", "Undo")).toBeHidden();
  await app.screenshot("both-places-restored");
});
