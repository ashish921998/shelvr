import { beforeEach } from "@e2e-dev/mobile";
import { type App, expect, type Locator, type Screen } from "e2e";

import { pollUntil } from "./poll.ts";

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
 * Long enough for Profile to be up after a tap that was accepted, even right
 * after a cold start, when it opens slowest. A normal open takes under two
 * seconds.
 */
const PROFILE_WAIT_MS = 15_000;

/**
 * Starts every test on Home as the anonymous dev user with the fixture data:
 * 4 saves, 3 spaces and a Pro entitlement. Needs AUTH_ENABLE_ANONYMOUS on the
 * dev Convex deployment; the reset button does not exist otherwise.
 */
export function startOnSeededHome(): void {
  beforeEach(async ({ app, screen }) => {
    // Three ways the app can open: already signed in (Profile), on the
    // sign-in screen (dev login), or, on a fresh install, on the onboarding
    // opener, whose "Sign in" link leads to the same dev login.
    const profile = screen.getByRole("button", "Profile");
    const devLogin = screen.getByTestId("dev-login-button");
    const openerSignIn = screen.getByRole(
      "button",
      /^Already have an account\?/,
    );
    await openApp(
      app,
      screen,
      async () =>
        (await profile.isVisible()) ||
        (await devLogin.isVisible()) ||
        (await openerSignIn.isVisible()),
    );
    // The app mounts under the launch splash, so its controls can appear in
    // the accessibility tree before they can receive touches.
    await expect(screen.getByRole("image", "Shelvr")).toBeHidden({
      timeout: 30_000,
    });
    // The opener's first tap can be lost the same way (onboarding and share
    // leave a signed-out app on the opener for the next flow).
    if (await openerSignIn.isVisible())
      await tapUntilVisible(openerSignIn, devLogin, {
        waitMs: 10_000,
        timeout: 60_000,
      });
    if (!(await profile.isVisible())) await devLogin.tap({ timeout: 30_000 });
    await answerAiConsent(screen, profile);

    // A Profile tap has been lost with nothing on screen to say why: the
    // engine reported the tap, Profile never opened, and Home looked ready
    // (seen 2026-10-14, once in three runs; tapping the moment the splash
    // leaves did not reproduce it in 13 tries).
    const settings = screen.getByRole("button", "Settings");
    await tapUntilVisible(profile, settings, {
      waitMs: PROFILE_WAIT_MS,
      timeout: BUNDLE_TIMEOUT,
    });
    await settings.tap();
    const reset = screen.getByTestId("reset-flow-fixtures");
    await scrollSettingsTo(screen, reset);
    await reset.tap();
    await screen.getByRole("button", "Reset").tap();
    await expect(screen.getByText("Flow fixtures ready")).toBeVisible({
      timeout: 30_000,
    });
    await screen.getByRole("button", "OK").tap();

    await openApp(app, screen, () => profile.isVisible());
    await expect(screen.getByRole("image", "Shelvr")).toBeHidden({
      timeout: 30_000,
    });
  });
}

/**
 * Opens the app and waits until `ready`. The dev launcher gives Metro 10
 * seconds to answer for the bundle (BUNDLE_URL in launch.ts), then shows its
 * server list instead of the app; a cold Metro can take longer, so the app is
 * opened again whenever the launcher shows.
 */
async function openApp(
  app: App,
  screen: Screen,
  ready: () => Promise<boolean>,
): Promise<void> {
  const launcher = screen.getByText("Searching for development servers...");
  const keepAi = screen.getByRole("button", AI_CONSENT_ALLOW);
  await app.open();
  await pollUntil(
    async () => {
      if (await ready()) return true;
      if (await launcher.isVisible()) await app.open();
      else if (await keepAi.isVisible()) await keepAi.tap();
      return false;
    },
    { timeout: BUNDLE_TIMEOUT },
  );
}

/** The AI consent card's yes (`aiConsent.allow` in en.json). */
const AI_CONSENT_ALLOW = "Keep it on";

/**
 * Answers the AI consent card if it covers the app. Signing in grants
 * consent on its own, but if that write fails the card stays up for this
 * user in every later test (all five flows stopped on it in one CI run), so
 * the flows answer it the way a person would.
 */
async function answerAiConsent(screen: Screen, home: Locator): Promise<void> {
  const keepAi = screen.getByRole("button", AI_CONSENT_ALLOW);
  await pollUntil(
    async () => (await home.isVisible()) || (await keepAi.isVisible()),
    { timeout: 60_000 },
  );
  if (await keepAi.isVisible()) {
    await keepAi.tap();
    await expect(home).toBeVisible({ timeout: 30_000 });
  }
}

/** Scrolls the open Settings sheet until `target` is on screen. */
export async function scrollSettingsTo(
  screen: Screen,
  target: Locator,
): Promise<void> {
  // A swipe sent while the Settings sheet is still rising moves nothing,
  // and the scroll gives up on the first swipe that moves nothing.
  await expect(screen.getByRole("button", "Sheet Grabber")).toHaveValue(
    "Expanded",
    { timeout: 30_000 },
  );
  await new Promise((resolve) => setTimeout(resolve, SHEET_TRANSITION_MS));
  // Even then a swipe has moved nothing (seen on CI, once in about ten
  // runs), so the scroll gets one more try after another settle.
  await screen.scrollUntilVisible(target).catch(async (error: unknown) => {
    if (!String(error).includes("moved nothing")) throw error;
    await new Promise((resolve) => setTimeout(resolve, SHEET_TRANSITION_MS));
    await screen.scrollUntilVisible(target);
  });
}

/**
 * Taps a tab bar item until `destination`, something only that tab's screen
 * shows, is on screen. The native tabs usually reach the accessibility tree
 * as `tab`, but have come through as `button` (on CI, the first test after a
 * fresh install), so the tab bar is searched for either. A tab tap has been
 * lost too: the engine reported it, Home stayed selected, and the flow waited
 * out its next step (main, 2026-10-15). The tab's own selected state is no
 * check: once Search is open, the tab bar shows only a collapsed Home tab
 * beside the search field, and Search is no longer in it.
 */
export async function tapTab(
  screen: Screen,
  name: string,
  destination: Locator,
): Promise<void> {
  const tabBar = screen.getByRole("tablist");
  const role = (await tabBar.getByRole("tab", name).isVisible())
    ? "tab"
    : "button";
  await tapUntilVisible(tabBar.getByRole(role, name), destination, {
    waitMs: TAB_WAIT_MS,
    timeout: 30_000,
  });
}

/** Long enough for a tab's screen to show after a tap that was accepted. */
const TAB_WAIT_MS = 3000;

/**
 * Fills a text field, recovering from the runner's "could not confirm the
 * typed text reached the field": the text may have landed in full, in part
 * or not at all. Seen on CI in about one run in ten. As the runner's hint
 * says, the field is read back: if it already holds `value` the fill
 * counts, otherwise it is filled once more (`fill` replaces the content). A
 * field that still ends up wrong fails on that second fill or later in the
 * flow, so this does not pass over a field that really is broken.
 */
export async function fillField(field: Locator, value: string): Promise<void> {
  try {
    await field.fill(value);
  } catch (error) {
    if (!String(error).includes("could not confirm the typed text")) {
      throw error;
    }
    const landed = await expect(field)
      .toHaveValue(value, { timeout: 2000 })
      .then(() => true)
      .catch(() => false);
    if (!landed) await field.fill(value);
  }
}

/**
 * Taps `control` until `result` is on screen, for a control whose tap can be
 * lost: an accepted tap shows `result` well inside `waitMs`, so it is tapped
 * again only after that. Each tap is its own step in the run's report, so a
 * lost tap stays visible there instead of passing unseen.
 */
export async function tapUntilVisible(
  control: Locator,
  result: Locator,
  { waitMs, timeout }: { waitMs: number; timeout: number },
): Promise<void> {
  await pollUntil(
    async () => {
      if (await result.isVisible()) return true;
      await control.tap({ timeout: Math.min(waitMs, timeout) });
      await expect(result)
        .toBeVisible({ timeout: waitMs })
        .catch(() => undefined);
      return result.isVisible();
    },
    { timeout },
  );
}

/**
 * Opens Add and taps one of its options.
 *
 * Home's Add drops a tap while the entitlement is still loading, and nothing
 * on Home says when that is over, so Add is tapped again if its sheet has not
 * come up. The options are in turn disabled until the entitlement has
 * loaded, and a tap on a disabled option does nothing.
 */
export async function chooseAddOption(
  screen: Screen,
  option: Locator,
): Promise<void> {
  await tapUntilVisible(screen.getByRole("button", "Add"), option, {
    waitMs: ADD_SHEET_WAIT_MS,
    timeout: 60_000,
  });
  await expect(option).toBeEnabled({ timeout: 30_000 });
  await option.tap();
}
