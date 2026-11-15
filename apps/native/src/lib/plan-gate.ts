import { useAccess } from "@/lib/free-plan";

export function usePlanGate(): { gated: boolean; planUnknown: boolean } {
  const access = useAccess();
  return {
    planUnknown: access.kind === "loading",
    gated: access.kind === "locked",
  };
}
