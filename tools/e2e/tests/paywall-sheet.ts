import { expect, type Screen } from "e2e";

export function paywallRestore(screen: Screen) {
  return screen.getByRole("button", /^Restore purchases$/i);
}

export async function expectPaywall(screen: Screen): Promise<void> {
  await expect(screen.getByText("How free trial works")).toBeVisible({
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
