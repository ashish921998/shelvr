import { expect, type Screen } from "e2e";

import { tapUntilVisible } from "./seeded-home.ts";

export function paywallTitle(screen: Screen) {
  return screen
    .getByText(
      /^(Make plans from your saves\.|Make date night easy\.|Plan .+ from your saves\.|Know where to eat next\.)$/,
    )
    .first();
}

export async function expectPaywall(screen: Screen): Promise<void> {
  await expect(paywallTitle(screen)).toBeVisible({ timeout: 60_000 });
  await expect(screen.getByRole("button", "Continue").last()).toBeVisible();
}

export async function openPaywallPlans(screen: Screen): Promise<void> {
  // A tap that lands while a step slides in is dropped, so tap until the next
  // step shows. Each step stays in the tree under the next; the last match is
  // the one on top.
  await tapUntilVisible(
    screen.getByRole("button", "Continue").last(),
    screen.getByText("How your trial works"),
    { waitMs: 5_000, timeout: 60_000 },
  );
  await tapUntilVisible(
    screen.getByRole("button", "See plans").last(),
    screen.getByRole("button", /^Yearly, /),
    { waitMs: 5_000, timeout: 60_000 },
  );
  await expect(screen.getByRole("button", /^Weekly, /)).toBeVisible();
  await expect(screen.getByRole("button", "Restore")).toBeVisible();
}
