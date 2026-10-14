import { beforeEach } from "@e2e-dev/mobile";
import { expect, type Locator, type Screen } from "e2e";

const BUNDLE_TIMEOUT = 180_000;

/**
 * How long an iOS sheet takes to finish moving. As the engine's `transition`
 * budget it only delays a tap on a control that appeared or moved with the
 * last action: the default allows half a second, and a tap on a control
 * inside a sheet that is still rising lands on the screen behind it. A
 * control that was already on screen under a closing sheet is tapped at once,
 * so a flow that taps one must wait for the close itself.
 */
export const SHEET_TRANSITION_MS = 1000;

/** Long enough for the Add sheet to be up after a tap that was accepted. */
const ADD_SHEET_WAIT_MS = 3000;

/**
 * Starts every test on Home as the anonymous dev user with the fixture data:
 * 4 saves, 3 spaces and a Pro entitlement. Needs AUTH_ENABLE_ANONYMOUS on the
 * dev Convex deployment; the reset button does not exist otherwise.
 */
export function startOnSeededHome(): void {
  beforeEach(async ({ app, screen }) => {
    await app.open();

    // Three ways the app can open: already signed in (Profile), on the
    // sign-in screen (dev login), or, on a fresh install, on the onboarding
    // opener, whose "Sign in" link leads to the same dev login.
    const profile = screen.getByRole("button", "Profile");
    const devLogin = screen.getByTestId("dev-login-button");
    const openerSignIn = screen.getByRole(
      "button",
      /^Already have an account\?/,
    );
    await expect
      .poll(
        async () =>
          (await profile.isVisible()) ||
          (await devLogin.isVisible()) ||
          (await openerSignIn.isVisible()),
        { timeout: BUNDLE_TIMEOUT },
      )
      .toBe(true);
    // The app mounts under the launch splash, so its controls can appear in
    // the accessibility tree before they can receive touches.
    await expect(screen.getByRole("image", "Shelvr")).toBeHidden({
      timeout: 30_000,
    });
    if (await openerSignIn.isVisible()) await openerSignIn.tap();
    if (!(await profile.isVisible())) await devLogin.tap({ timeout: 30_000 });

    await profile.tap({ timeout: BUNDLE_TIMEOUT });
    // Right after a cold start the first Profile open has taken longer than
    // a locator's default wait.
    await screen
      .getByRole("button", "Settings")
      .tap({ timeout: BUNDLE_TIMEOUT });
    const reset = screen.getByTestId("reset-flow-fixtures");
    // A swipe sent while the Settings sheet is still rising moves nothing,
    // and the scroll gives up on the first swipe that moves nothing.
    await expect(screen.getByRole("button", "Sheet Grabber")).toHaveValue(
      "Expanded",
      { timeout: 30_000 },
    );
    await new Promise((resolve) => setTimeout(resolve, SHEET_TRANSITION_MS));
    await screen.scrollUntilVisible(reset);
    await reset.tap();
    await screen.getByRole("button", "Reset").tap();
    await expect(screen.getByText("Flow fixtures ready")).toBeVisible({
      timeout: 30_000,
    });
    await screen.getByRole("button", "OK").tap();

    await app.open();
    await expect(profile).toBeVisible({ timeout: BUNDLE_TIMEOUT });
    await expect(screen.getByRole("image", "Shelvr")).toBeHidden({
      timeout: 30_000,
    });
  });
}

/**
 * Opens Add and taps one of its options.
 *
 * Home's Add drops a tap while the entitlement is still loading, and nothing
 * on Home says when that is over, so Add is tapped again if its sheet has not
 * come up. An accepted tap has the sheet up well inside the wait between
 * taps. The options are in turn disabled until the entitlement has loaded,
 * and a tap on a disabled option does nothing.
 */
export async function chooseAddOption(
  screen: Screen,
  option: Locator,
): Promise<void> {
  const add = screen.getByRole("button", "Add");
  await expect
    .poll(
      async () => {
        if (await option.isVisible()) return true;
        await add.tap();
        await new Promise((resolve) => setTimeout(resolve, ADD_SHEET_WAIT_MS));
        return option.isVisible();
      },
      { timeout: 60_000 },
    )
    .toBe(true);
  await expect(option).toBeEnabled({ timeout: 30_000 });
  await option.tap();
}
