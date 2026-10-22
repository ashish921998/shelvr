import type { AppleProfile } from "@auth/core/providers/apple";

/** Drops the `image: null` Apple emits; Convex Auth's users schema accepts only a string or absent. */
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
    ...(tokens.refresh_token
      ? { appleRefreshToken: tokens.refresh_token }
      : {}),
  };
}

export function nativeAppleProfile(token: { email?: string }, name: unknown) {
  const given = typeof name === "string" ? name.trim().slice(0, 200) : "";
  const shown = given || token.email;
  return {
    ...(shown ? { name: shown } : {}),
    ...(token.email ? { email: token.email } : {}),
  };
}
