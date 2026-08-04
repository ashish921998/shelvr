import type { Auth } from "convex/server";

/** Returns the Clerk `sub` when present, otherwise null. */
export async function getUserId({ auth }: { auth: Auth }) {
  return (await auth.getUserIdentity())?.subject ?? null;
}

/**
 * Returns the Clerk `sub`. Throws if the caller is not authenticated.
 * Every public function must derive userId from this — never from a client arg.
 */
export async function requireUserId({ auth }: { auth: Auth }) {
  const userId = await getUserId({ auth });
  if (userId) return userId;

  throw new Error(
    "Authenticated user was required, but no Clerk subject was found",
  );
}
