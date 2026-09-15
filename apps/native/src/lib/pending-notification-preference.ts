import * as SecureStore from "expo-secure-store";

const preferenceKey = `shelvr.pending.weekly-shelf-${(
  process.env.EXPO_PUBLIC_CONVEX_URL ?? "default"
).replace(/[^A-Za-z0-9._-]/g, "_")}`;

/**
 * Onboarding can run before authentication. Keep the user's explicit opt-in
 * until an authenticated notification session can register this device and
 * persist the weekly-shelf preference on the server.
 */
export function hasPendingWeeklyShelfOptIn(): boolean {
  return SecureStore.getItem(preferenceKey) === "true";
}

export function setPendingWeeklyShelfOptIn(enabled: boolean): void {
  SecureStore.setItem(preferenceKey, enabled ? "true" : "");
}

export async function syncPendingWeeklyShelfOptIn(
  enable: () => Promise<boolean | undefined>,
): Promise<void> {
  if (!hasPendingWeeklyShelfOptIn()) return;
  if (await enable()) setPendingWeeklyShelfOptIn(false);
}
