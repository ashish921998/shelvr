import type { Device } from "@e2e-dev/mobile";
import { type App, expect, type Screen } from "e2e";

import { openApp } from "./seeded-home.ts";

/**
 * Starts the app as a first-time user on the onboarding opener. Onboarding
 * is gated by a keychain flag and the dev sign-in token lives in the
 * keychain too, so clearing it signs out and forgets onboarding together
 * (docs/architecture/local-qa.md). The next dev sign-in is a new anonymous
 * user with an unused demo save.
 */
export async function startFreshOnboarding({
  app,
  device,
  screen,
}: {
  app: App;
  device: Device;
  screen: Screen;
}): Promise<void> {
  await device.closeApp().catch(() => undefined);
  await device.clearKeychain();
  const start = screen.getByRole("button", "Start yours");
  await openApp(app, screen, () => start.isVisible());
  await expect(screen.getByRole("image", "Shelvr")).toBeHidden({
    timeout: 30_000,
  });
}

/**
 * Walks the opener, interests and setup steps, picking Articles, which seeds
 * and picks a space of its own so Continue enables. Ends on the first-save
 * step.
 */
export async function walkToFirstSave(screen: Screen): Promise<void> {
  await screen.getByRole("button", "Start yours").tap();
  await expect(screen.getByText("What are you into?")).toBeVisible({
    timeout: 30_000,
  });
  await screen.getByRole("button", "Continue").tap();
  await expect(screen.getByText("What do you save?")).toBeVisible({
    timeout: 30_000,
  });
  await screen.getByRole("checkbox", /^Articles/).tap();
  const next = screen.getByRole("button", "Continue");
  await expect(next).toBeEnabled({ timeout: 10_000 });
  await next.tap();
  await expect(screen.getByText(/^Save your first/)).toBeVisible({
    timeout: 30_000,
  });
}
