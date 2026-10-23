/**
 * The public queries and mutations that do not go through `authedQuery` or
 * `authedMutation` (`model/auth.ts`), because each must answer a caller with no live
 * account. Each has one sentence on why; a reviewer checks the reason against the handler.
 * `publicFunctions.test.ts` fails on any other public query or mutation that skips the
 * builders. Public actions have no builder yet and are not listed.
 *
 * A key is the Convex function path: the module path relative to `convex/` without its
 * extension, a colon, and the export name, as in `users:getCurrentUser`.
 * `.github/CODEOWNERS` names the owner for this file.
 */
export const PUBLIC_ON_PURPOSE: Readonly<Record<string, string>> = {
  "auth:isAuthenticated":
    "Convex Auth's own query answers false to a signed-out caller, which is how the client learns it is signed out.",
  "devFixtures:canResetCurrentUser":
    "Answers false, not an error, to a signed-out caller or a non-development account, so the dev-only reset button can hide.",
  "users:deleteCurrentUserAccount":
    "Resumes the cleanup for an account already marked deleting, which requireUserId would refuse.",
  "users:getCurrentUser":
    "Returns null to a signed-out caller or an account already marked deleting, so the client can show signed-out state and stop syncing identity.",
};
