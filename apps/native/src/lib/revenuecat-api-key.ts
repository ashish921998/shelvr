import Constants from "expo-constants";
import { Platform } from "react-native";

function selectProductionApiKey(): string | undefined {
  if (Platform.OS === "ios") {
    return process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY;
  }
  if (Platform.OS === "android") {
    return process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY;
  }
  return undefined;
}

function selectRevenueCatApiKey(): string | undefined {
  if (Constants.expoConfig?.extra?.variant === "production") {
    return selectProductionApiKey();
  }
  // The SDK kills the app with a "Wrong API Key" alert when a Test Store key
  // is configured outside __DEV__, so release-mode dev and preview builds
  // leave RevenueCat unconfigured. Entitlement reads the Convex subscriptions
  // row, so saves and the anonymous dev bypass are unaffected.
  if (!__DEV__) return undefined;
  return process.env.EXPO_PUBLIC_REVENUECAT_TEST_KEY;
}

export const REVENUECAT_API_KEY = selectRevenueCatApiKey();

/** True when this build leaves RevenueCat unconfigured on purpose (see
 * above), so callers can skip billing work instead of reporting the missing
 * key as a failure. A production build with no key is still a failure. */
export const REVENUECAT_DISABLED_BY_BUILD =
  Constants.expoConfig?.extra?.variant !== "production" && !__DEV__;
