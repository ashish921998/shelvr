import Constants from "expo-constants";

const ANONYMOUS_AUTH_VARIANTS = ["development"];

export function isAnonymousAuthEnabled(): boolean {
  return (
    process.env.EXPO_PUBLIC_AUTH_ENABLE_ANONYMOUS === "true" &&
    ANONYMOUS_AUTH_VARIANTS.includes(Constants.expoConfig?.extra?.variant)
  );
}
