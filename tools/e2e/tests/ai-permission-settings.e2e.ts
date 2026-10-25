import { test } from "@e2e-dev/mobile";
import { expect } from "e2e";

import { startFreshOnboarding } from "./fresh-onboarding.ts";
import { scrollSettingsTo, tapUntilVisible } from "./seeded-home.ts";

test("a new account reaches Home without a consent screen and keeps AI off in Settings", async ({
  device,
  screen,
}) => {
  await startFreshOnboarding({ device, screen });
  const login = screen.getByTestId("dev-login-button");
  await tapUntilVisible(
    screen.getByRole("button", /^Already have an account\?/),
    login,
    { waitMs: 10_000, timeout: 60_000 },
  );
  await login.tap();
  const profile = screen.getByRole("button", "Profile");
  await expect(profile).toBeVisible({ timeout: 60_000 });
  await expect(
    screen.getByText("Let Shelvr find the places in your saves?"),
  ).toBeHidden();
  const settings = screen.getByRole("button", "Settings");
  await tapUntilVisible(profile, settings, { waitMs: 15_000, timeout: 60_000 });
  await settings.tap();
  const permission = screen.getByRole("switch", "Find places with AI");
  await scrollSettingsTo(screen, permission);
  await expect(permission).toHaveValue("0");
});
