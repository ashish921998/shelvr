import { analytics } from "@/lib/analytics";
import { useEffect, useRef } from "react";

export function useReportLoadFailure(
  event: string,
  { error, isSuccess }: { error: Error | null; isSuccess: boolean },
) {
  const reported = useRef(false);
  useEffect(() => {
    if (isSuccess) reported.current = false;
    else if (error && !reported.current) {
      reported.current = true;
      analytics.captureError(event, error);
    }
  }, [event, error, isSuccess]);
}
