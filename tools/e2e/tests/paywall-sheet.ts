import { expect, type Screen } from "e2e";

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
  await screen.getByRole("button", "Continue").last().tap();
  await expect(screen.getByText("How your trial works")).toBeVisible();
  await screen.getByRole("button", "See plans").last().tap();
  await expect(screen.getByRole("button", /^Yearly, /)).toBeVisible();
  await expect(screen.getByRole("button", /^Weekly, /)).toBeVisible();
  await expect(screen.getByRole("button", "Restore")).toBeVisible();
}
