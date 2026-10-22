import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { beforeEach } from "@e2e-dev/mobile";
import { type App, expect, type Locator, type Screen } from "e2e";

import { isExpoLauncher, LAUNCHER_GRACE_MS } from "./launch.ts";
import { pollUntil } from "./poll.ts";

const BUNDLE_TIMEOUT = 180_000;

/** The engine delays a tap only on a control that appeared or moved with the last action. */
export const SHEET_TRANSITION_MS = 1000;

const ADD_SHEET_WAIT_MS = 3000;

const PROFILE_WAIT_MS = 15_000;

export function startOnSeededHome(options: { reset?: "settings" } = {}): void {
  const fromBackend =
    options.reset !== "settings" && process.env.E2E_FIXTURE_RESET === "backend";
  beforeEach(async ({ app, screen }) => {
    if (fromBackend) await resetFixturesFromBackend();
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
    // Controls under the launch splash show in the accessibility tree before they take touches.
    await expect(screen.getByRole("image", "Shelvr")).toBeHidden({
      timeout: 30_000,
    });
    if (await openerSignIn.isVisible())
      await tapUntilVisible(openerSignIn, devLogin, {
        waitMs: 10_000,
        timeout: 60_000,
      });
    const wasSignedIn = await profile.isVisible();
    if (!wasSignedIn) await devLogin.tap({ timeout: 30_000 });
    await answerAiConsent(screen, profile);
    if (fromBackend && wasSignedIn) return;

    if (fromBackend) await resetFixturesFromBackend();
    else await resetThroughSettings(screen, profile);

    await openApp(app, screen, () => profile.isVisible());
    await expect(screen.getByRole("image", "Shelvr")).toBeHidden({
      timeout: 30_000,
    });
  });
}

// The Convex CLI reads its deployment from .env.local in this directory.
const NATIVE_APP_DIR = fileURLToPath(
  new URL("../../../apps/native/", import.meta.url),
);

async function resetFixturesFromBackend(): Promise<void> {
  await promisify(execFile)(
    "npx",
    ["convex", "run", "devFixtures:resetAnonymousUsersForE2e"],
    { cwd: NATIVE_APP_DIR, timeout: 60_000 },
  );
}

async function resetThroughSettings(
  screen: Screen,
  profile: Locator,
): Promise<void> {
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
}

async function openApp(
  app: App,
  screen: Screen,
  ready: () => Promise<boolean>,
): Promise<void> {
  // The dev launcher shows its server list when Metro is slow to answer for the bundle.
  const keepAi = screen.getByRole("button", AI_CONSENT_ALLOW);
  await app.open();
  let openedAt = Date.now();
  await pollUntil(
    async () => {
      if (await ready()) return true;
      if (
        Date.now() - openedAt > LAUNCHER_GRACE_MS &&
        (await isExpoLauncher(screen))
      ) {
        await app.open();
        openedAt = Date.now();
      } else if (await keepAi.isVisible()) await keepAi.tap();
      return false;
    },
    { timeout: BUNDLE_TIMEOUT },
  );
}

const AI_CONSENT_ALLOW = "Keep it on";

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

export async function scrollSettingsTo(
  screen: Screen,
  target: Locator,
): Promise<void> {
  await expect(screen.getByRole("button", "Sheet Grabber")).toHaveValue(
    "Expanded",
    { timeout: 30_000 },
  );
  await new Promise((resolve) => setTimeout(resolve, SHEET_TRANSITION_MS));
  // scrollUntilVisible throws on the first swipe that moves nothing.
  await screen.scrollUntilVisible(target).catch(async (error: unknown) => {
    if (!String(error).includes("moved nothing")) throw error;
    await new Promise((resolve) => setTimeout(resolve, SHEET_TRANSITION_MS));
    await screen.scrollUntilVisible(target);
  });
}

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

const TAB_WAIT_MS = 3000;

export async function fillField(field: Locator, value: string): Promise<void> {
  try {
    await field.fill(value);
  } catch (error) {
    // The field may hold none, part or all of the text when the runner cannot confirm it.
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
