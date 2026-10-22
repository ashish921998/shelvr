import { beforeEach } from "@e2e-dev/mobile";
import { type App, expect, type Locator, type Screen } from "e2e";

import { pollUntil } from "./poll.ts";

const BUNDLE_TIMEOUT = 180_000;

export const SHEET_TRANSITION_MS = 1000;

const ADD_SHEET_WAIT_MS = 3000;

const PROFILE_WAIT_MS = 15_000;

export function startOnSeededHome(): void {
  beforeEach(async ({ app, screen }) => {
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
    await expect(screen.getByRole("image", "Shelvr")).toBeHidden({
      timeout: 30_000,
    });
    if (await openerSignIn.isVisible())
      await tapUntilVisible(openerSignIn, devLogin, {
        waitMs: 10_000,
        timeout: 60_000,
      });
    if (!(await profile.isVisible())) await devLogin.tap({ timeout: 30_000 });
    await answerAiConsent(screen, profile);

    const settings = screen.getByRole("button", "Settings");
    await tapUntilVisible(profile, settings, {
      waitMs: PROFILE_WAIT_MS,
      timeout: BUNDLE_TIMEOUT,
    });
    await settings.tap();
    const reset = screen.getByTestId("reset-flow-fixtures");
    await expect(screen.getByRole("button", "Sheet Grabber")).toHaveValue(
      "Expanded",
      { timeout: 30_000 },
    );
    await new Promise((resolve) => setTimeout(resolve, SHEET_TRANSITION_MS));
    await screen.scrollUntilVisible(reset).catch(async (error: unknown) => {
      if (!String(error).includes("moved nothing")) throw error;
      await new Promise((resolve) => setTimeout(resolve, SHEET_TRANSITION_MS));
      await screen.scrollUntilVisible(reset);
    });
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
