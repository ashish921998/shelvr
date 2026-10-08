import type { AppleProfile } from "@auth/core/providers/apple";

/**
 * Auth.js' Apple provider emits `image: null`, but Convex Auth's users schema
 * intentionally accepts only a string or an absent image. Keep Apple's useful
 * identity fields and omit the unsupported null value.
 */
export function normalizeAppleProfile(
  profile: AppleProfile,
  tokens: { refresh_token?: string },
) {
  const name = profile.user
    ? `${profile.user.name.firstName} ${profile.user.name.lastName}`
    : profile.email;

  return {
    id: profile.sub,
    name,
    email: profile.email,
    // Rides the profile to `keepAppleRefreshToken`, the only hook Convex Auth
    // offers that sees the provider's token response.
    ...(tokens.refresh_token
      ? { appleRefreshToken: tokens.refresh_token }
      : {}),
  };
}
