import { beforeEach } from "@e2e-dev/mobile";
import { expect } from "e2e";

const BUNDLE_TIMEOUT = 180_000;

/**
 * Starts every test on Home as the anonymous dev user with the fixture data:
 * 4 saves, 3 spaces and a Pro entitlement. Needs AUTH_ENABLE_ANONYMOUS on the
 * dev Convex deployment; the reset button does not exist otherwise.
 */
export function startOnSeededHome(): void {
  beforeEach(async ({ app, screen }) => {
    await app.open();

    const profile = screen.getByRole("button", "Profile");
    const devLogin = screen.getByTestId("dev-login-button");
    await expect
      .poll(
        async () => (await profile.isVisible()) || (await devLogin.isVisible()),
        {
          timeout: BUNDLE_TIMEOUT,
        },
      )
      .toBe(true);
    if (await devLogin.isVisible()) await devLogin.tap();

    await profile.tap({ timeout: BUNDLE_TIMEOUT });
    await screen.getByRole("button", "Settings").tap();
    const reset = screen.getByTestId("reset-flow-fixtures");
    await screen.scrollUntilVisible(reset);
    await reset.tap();
    await screen.getByRole("button", "Reset").tap();
    await expect(screen.getByText("Flow fixtures ready")).toBeVisible({
      timeout: 30_000,
    });
    await screen.getByRole("button", "OK").tap();

    await app.open();
    await expect(profile).toBeVisible({ timeout: BUNDLE_TIMEOUT });
  });
}
