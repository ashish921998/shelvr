import { motion } from "@/lib/motion";
import { useEffect, useState } from "react";
import { useReducedMotion } from "react-native-reanimated";

/** Pins dropped so far, one per stagger; all at once under Reduce Motion, where each row only fades in. */
export function useDroppedPins(count: number): number {
  const reduced = useReducedMotion();
  const [dropped, setDropped] = useState(reduced ? count : 0);
  useEffect(() => {
    if (dropped >= count) return;
    const timer = setTimeout(
      () => setDropped(reduced ? count : dropped + 1),
      reduced ? 0 : motion.duration.stagger,
    );
    return () => clearTimeout(timer);
  }, [dropped, count, reduced]);
  return dropped;
}
