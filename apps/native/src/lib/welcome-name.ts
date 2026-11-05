import { useMyFirstName } from "@/lib/shared-lists";
import { whenSheetSettled } from "@/lib/entitlement";
import { whenTrialPrimerDone } from "@/lib/trial-reminder";
import { welcomeName } from "@/lib/welcome-save";
import { useIsFocused } from "expo-router";
import { useEffect, useRef, useState } from "react";

export function useWelcomeName(
  userId: string | undefined,
  ready: boolean,
): { open: boolean; holding: boolean; close: () => void } {
  const pending = welcomeName.usePending(userId);
  const { firstName, failed } = useMyFirstName();
  const focused = useIsFocused();
  const [open, setOpen] = useState(false);
  const started = useRef<string | null>(null);
  useEffect(() => {
    if (
      userId === undefined ||
      started.current === userId ||
      !pending ||
      !ready ||
      !focused ||
      (firstName === undefined && !failed)
    )
      return;
    started.current = userId;
    if (firstName !== null) {
      welcomeName.finish(userId);
      return;
    }
    let live = true;
    void whenSheetSettled()
      .then(whenTrialPrimerDone)
      .then(() => {
        if (!live) return;
        welcomeName.finish(userId);
        setOpen(true);
      });
    return () => {
      live = false;
      started.current = null;
    };
  }, [userId, pending, ready, focused, firstName, failed]);
  return { open, holding: open || pending, close: () => setOpen(false) };
}
