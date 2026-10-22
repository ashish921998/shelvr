import { decidePostAuthRoute } from "@/lib/share/pending-share";
import { hasPendingShareOnDevice } from "@/lib/share/pending-share-store";
import { hasResumableSharedPayloads } from "@/lib/share/resumable-payloads";
import { useOnboarding } from "@/lib/onboarding";
import { useConvexAuth } from "convex/react";
import { usePathname, useRouter } from "expo-router";
import { useEffect, useRef } from "react";

export function useResumePendingShare(blocked = false): void {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const { onboarded } = useOnboarding();
  const router = useRouter();
  const pathname = usePathname();
  const navigatedRef = useRef(false);

  useEffect(() => {
    if (isLoading || !onboarded || !isAuthenticated || blocked) {
      navigatedRef.current = false;
      return;
    }
    const href = decidePostAuthRoute({
      hasOwedShare: hasPendingShareOnDevice() || hasResumableSharedPayloads(),
    });
    if (href !== "/share") {
      navigatedRef.current = false;
      return;
    }
    if (pathname === "/share") return;
    if (navigatedRef.current) return;

    navigatedRef.current = true;
    router.replace("/share");
  }, [blocked, isAuthenticated, isLoading, onboarded, pathname, router]);
}
