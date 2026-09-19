import Constants from "expo-constants";

function selectRevenueCatApiKey(): string | undefined {
  if (Constants.expoConfig?.extra?.variant === "production") {
    return process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY;
  }
  // The SDK kills the app with a "Wrong API Key" alert when a Test Store key
  // is configured outside __DEV__, so release-mode dev and preview builds
  // leave RevenueCat unconfigured. Entitlement reads the Convex subscriptions
  // row, so saves and the anonymous dev bypass are unaffected.
  if (!__DEV__) return undefined;
  return process.env.EXPO_PUBLIC_REVENUECAT_TEST_KEY;
}

export const REVENUECAT_API_KEY = selectRevenueCatApiKey();
