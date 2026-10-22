import { useAnimatedReaction, withTiming } from "react-native-reanimated";
import { motion } from "@/lib/motion";

import { useCardAnimation } from "./card-animation";
import { useDeckAnimation } from "./deck-animation";

export function useUndoAnimation(index: number) {
  const { isDragging, animatedIndex, currentIndex, undoIndex } =
    useDeckAnimation();
  const { panX, panY, absoluteYAnchor } = useCardAnimation();

  useAnimatedReaction(
    () => undoIndex.get(),
    (undoValue) => {
      if (undoValue === null || undoValue !== index) {
        return;
      }

      isDragging.set(false);
      absoluteYAnchor.set(0);

      animatedIndex.set(
        withTiming(currentIndex.get() + 1, motion.timing.enter),
      );
      currentIndex.set(currentIndex.get() + 1);

      panX.set(withTiming(0, motion.timing.enter));
      panY.set(withTiming(0, motion.timing.enter));

      undoIndex.set(null);
    },
  );
}
