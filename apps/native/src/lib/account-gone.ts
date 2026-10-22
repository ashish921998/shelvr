import { useAuthActions } from "@convex-dev/auth/react";
import { useConvexAuth } from "convex/react";
import { useEffect } from "react";
import { analytics } from "@/lib/analytics";
import { useCurrentUser } from "@/lib/current-user";
import { clearFirstSaveReminder } from "@/lib/first-save-reminder";
import { clearTrialReminder } from "@/lib/trial-reminder";

export function useSignOutWhenAccountGone(): void {
  const { isAuthenticated } = useConvexAuth();
  const { data: user, isSuccess, isFetching } = useCurrentUser();
  const { signOut } = useAuthActions();
  const gone = isAuthenticated && isSuccess && !isFetching && user === null;

  useEffect(() => {
    if (!gone) return;
    const signOutGone = async () => {
      await signOut();
      await clearFirstSaveReminder();
      await clearTrialReminder();
    };
    signOutGone().catch((error: unknown) => {
      analytics.captureError("account_gone_sign_out_failed", error);
    });
  }, [gone, signOut]);
}
