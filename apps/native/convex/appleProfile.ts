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

/**
 * The profile for a new account made by the native sheet. The email comes from
 * the verified token. The name comes from the app, which Apple hands it only
 * on a person's first authorization, so it falls back to the email the way the
 * web flow does. Absent fields are omitted, because the users schema takes a
 * string or nothing.
 */
export function nativeAppleProfile(token: { email?: string }, name: unknown) {
  const given = typeof name === "string" ? name.trim().slice(0, 200) : "";
  const shown = given || token.email;
  return {
    ...(shown ? { name: shown } : {}),
    ...(token.email ? { email: token.email } : {}),
  };
}
