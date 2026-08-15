import type { AppleProfile } from "@auth/core/providers/apple";

/**
 * Auth.js' Apple provider emits `image: null`, but Convex Auth's users schema
 * intentionally accepts only a string or an absent image. Keep Apple's useful
 * identity fields and omit the unsupported null value.
 */
export function normalizeAppleProfile(profile: AppleProfile) {
  const name = profile.user
    ? `${profile.user.name.firstName} ${profile.user.name.lastName}`
    : profile.email;

  return {
    id: profile.sub,
    name,
    email: profile.email,
  };
}
