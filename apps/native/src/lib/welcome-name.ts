import { analytics } from "@/lib/analytics";
import { useSheetTurn } from "@/lib/one-time-sheets";
import { useMyFirstName } from "@/lib/shared-lists";
import { welcomeName } from "@/lib/welcome-save";
import { useIsFocused } from "expo-router";
import { useEffect, useState } from "react";

export function useWelcomeName(
  userId: string | undefined,
  ready: boolean,
): { open: boolean; pending: boolean; close: () => void } {
  const pending = welcomeName.usePending(userId);
  const { firstName, failed, error } = useMyFirstName();
  const focused = useIsFocused();
  const [asked, setAsked] = useState<{ userId: string; open: boolean } | null>(
    null,
  );
  const askedHere = asked !== null && asked.userId === userId;
  const open = asked !== null && askedHere && asked.open;
  const due = pending && ready && focused;
  useEffect(() => {
    if (userId === undefined || !due || firstName === null) return;
    if (firstName === undefined) {
      if (!failed) return;
      analytics.captureError("welcome_name_lookup_failed", error);
    }
    welcomeName.finish(userId);
  }, [userId, due, firstName, failed, error]);
  const turn = useSheetTurn(
    "name",
    (userId !== undefined && due && firstName === null && !askedHere) || open,
  );
  if (turn && userId !== undefined && !askedHere)
    setAsked({ userId, open: true });
  useEffect(() => {
    if (open && userId !== undefined) welcomeName.finish(userId);
  }, [open, userId]);
  return {
    open,
    pending,
    close: () => setAsked((current) => current && { ...current, open: false }),
  };
}
