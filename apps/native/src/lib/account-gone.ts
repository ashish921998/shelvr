import { useAuthActions } from "@convex-dev/auth/react";
import { useConvexAuth } from "convex/react";
import { useEffect } from "react";
import { analytics } from "@/lib/analytics";
import { useCurrentUser } from "@/lib/current-user";

/**
 * Signs this device out once its account is deleted from another device.
 *
 * The deleted account's access token stays valid here until it expires, so
 * Convex Auth still reports signed in. The server stops honouring it the
 * moment deletion starts (`requireUserId` rejects a deleting owner), and
 * `getCurrentUser` answers `null` for that identity. Signing out moves the
 * app to the sign-in screen, and the signed-out edge clears the Convex cache,
 * the widget and the analytics identity like any other sign-out.
 */
export function useSignOutWhenAccountGone(): void {
  const { isAuthenticated } = useConvexAuth();
  const { data: user, isSuccess, isFetching } = useCurrentUser();
  const { signOut } = useAuthActions();
  const gone = isAuthenticated && isSuccess && !isFetching && user === null;

  useEffect(() => {
    if (!gone) return;
    // Convex Auth's signOut ignores a server refusal and always erases the
    // local tokens, so a failure here is local storage only.
    signOut().catch((error: unknown) => {
      analytics.captureError("account_gone_sign_out_failed", error);
    });
  }, [gone, signOut]);
}
