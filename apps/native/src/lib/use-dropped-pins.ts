import { motion } from "@/lib/motion";
import { useEffect, useState } from "react";
import { useReducedMotion } from "react-native-reanimated";

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
