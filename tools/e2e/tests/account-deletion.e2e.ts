import { test } from "@e2e-dev/mobile";
import { expect } from "e2e";

import {
  scrollSettingsTo,
  startOnSeededHome,
  tapUntilVisible,
} from "./seeded-home.ts";

startOnSeededHome({ reset: "settings" });

test("deletes the development account and starts the next account with no old saves", async ({
  app,
  screen,
}) => {
  const profile = screen.getByRole("button", "Profile");
  const settings = screen.getByRole("button", "Settings");
  await tapUntilVisible(profile, settings, { waitMs: 5000, timeout: 30000 });
  await settings.tap();
  const deleteAccount = screen.getByRole("button", "Delete account");
  await scrollSettingsTo(screen, deleteAccount);
  await deleteAccount.tap();
  await expect(screen.getByText("Delete account?")).toBeVisible();
  await screen
    .getByRole("group", "Delete account?")
    .getByRole("button", "Delete account")
    .tap();

  const signIn = screen.getByTestId("dev-login-button");
  await expect(signIn).toBeVisible({ timeout: 60000 });
  await expect(profile).toBeHidden();
  await app.screenshot("account-deleted-sign-in");
  await signIn.tap();
  await expect(profile).toBeVisible({ timeout: 60000 });
  await expect(screen.getByTestId("fixture-item-ramen")).toBeHidden();
  await expect(
    screen.getByTestId("fixture-item-apartment-checklist"),
  ).toBeHidden();
  await expect(screen.getByText("0 of 3 saved")).toBeVisible();
  await app.screenshot("new-account-empty-home");
});
