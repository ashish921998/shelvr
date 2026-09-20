import Constants from "expo-constants";

// Fail closed like posthog.ts: only builds that declare a non-production
// variant qualify, so a build that carries no `extra.variant` hides the button.
const ANONYMOUS_AUTH_VARIANTS = ["development", "preview"];

/** True when the build may render the passwordless "Dev login" button and the
 * fixture reset: the build-time flag is set and the variant is development or
 * preview, never production. The server independently refuses anonymous
 * sign-in unless the deployment sets AUTH_ENABLE_ANONYMOUS=true
 * (convex/auth.ts). */
export function isAnonymousAuthEnabled(): boolean {
  return (
    process.env.EXPO_PUBLIC_AUTH_ENABLE_ANONYMOUS === "true" &&
    ANONYMOUS_AUTH_VARIANTS.includes(Constants.expoConfig?.extra?.variant)
  );
}
