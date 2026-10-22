import { expect, type Screen } from "e2e";

function paywallRestore(screen: Screen) {
  return screen.getByRole("button", /^Restore purchases$/i);
}

export function paywallTitle(screen: Screen) {
  return screen.getByText("How free trial works");
}

export async function expectPaywall(screen: Screen): Promise<void> {
  await expect(paywallTitle(screen)).toBeVisible({
    timeout: 60_000,
  });
  await expect(screen.getByText(/Shelvr Pro/)).toBeVisible();
  await expect(screen.getByRole("button", /^7-day trial, /)).toBeVisible();
  await expect(screen.getByRole("button", "View all plans")).toBeVisible();
  await expect(
    screen.getByRole("button", "Start 7-day free trial"),
  ).toBeVisible();
  await expect(paywallRestore(screen)).toBeVisible();
}
