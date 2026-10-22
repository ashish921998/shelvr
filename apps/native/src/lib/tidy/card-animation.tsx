import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type FC,
  type PropsWithChildren,
} from "react";
import { useWindowDimensions } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import {
  cancelAnimation,
  useSharedValue,
  withSpring,
  type SharedValue,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";

import { motion } from "@/lib/motion";

import { useDeckAnimation } from "./deck-animation";
import {
  swipeDecision,
  swipeProgress,
  type TidyAction,
} from "./swipe-decision";
import { useSingleHapticOnPan } from "./use-single-haptic-on-pan";

export type { TidyAction } from "./swipe-decision";

type CardAnimationValue = {
  panX: SharedValue<number>;
  panY: SharedValue<number>;
  absoluteYAnchor: SharedValue<number>;
  panDistanceX: number;
  panDistanceY: number;
};

const CardAnimationContext = createContext<CardAnimationValue | null>(null);

type Props = PropsWithChildren<{
  index: number;
  onDecision: (index: number, action: TidyAction) => void;
}>;

export const CardAnimationProvider: FC<Props> = ({
  index,
  onDecision,
  children,
}) => {
  const { isDragging, animatedIndex, currentIndex } = useDeckAnimation();
  const { width, height } = useWindowDimensions();

  const panDistanceX = width / 4;
  const panDistanceY = height / 5;

  const panX = useSharedValue(0);
  const panY = useSharedValue(0);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  const absoluteYAnchor = useSharedValue(0);

  const { singleHapticOnChange, resetHaptic, commitHaptic } =
    useSingleHapticOnPan({
      thresholdX: panDistanceX,
      thresholdY: panDistanceY,
    });

  const handleDecision = useCallback(
    (action: TidyAction) => {
      onDecision(index, action);
    },
    [index, onDecision],
  );

  const gesture = useMemo(
    () =>
      Gesture.Pan()
        .onBegin((event) => {
          cancelAnimation(panX);
          cancelAnimation(panY);
          cancelAnimation(animatedIndex);
          startX.set(panX.get());
          startY.set(panY.get());
          resetHaptic();
          isDragging.set(true);
          absoluteYAnchor.set(event.absoluteY);
        })
        .onChange((event) => {
          const x = startX.get() + event.translationX;
          const y = startY.get() + event.translationY;
          const { progress } = swipeProgress(x, y, panDistanceX, panDistanceY);
          animatedIndex.set(currentIndex.get() - Math.min(1, progress));

          panX.set(x);
          panY.set(y);

          singleHapticOnChange(x, y);
        })
        .onEnd((event, success) => {
          isDragging.set(false);
          // RNGH also calls onEnd for a FAILED or CANCELLED pan, with
          // success=false. Deciding from one would delete or keep a photo the
          // person never released, and onFinalize cannot recall a scheduled
          // decision, so leave a cancelled pan to its recovery below.
          if (!success) return;

          const x = startX.get() + event.translationX;
          const y = startY.get() + event.translationY;
          panX.set(x);
          panY.set(y);
          const action = swipeDecision(
            x,
            y,
            event.velocityX,
            event.velocityY,
            panDistanceX,
            panDistanceY,
          );

          if (action !== null) {
            currentIndex.set(Math.round(currentIndex.get() - 1));

            const direction = action === "delete" ? -1 : 1;
            const commitUp = action === "save";
            const indexVelocity = commitUp
              ? event.velocityY / panDistanceY
              : (-direction * event.velocityX) / panDistanceX;
            animatedIndex.set(
              withSpring(currentIndex.get(), {
                ...motion.spring.drag,
                velocity: indexVelocity,
                overshootClamping: true,
              }),
            );
            panX.set(
              withSpring(commitUp ? 0 : direction * width * 1.25, {
                ...motion.spring.drag,
                velocity: event.velocityX,
                overshootClamping: true,
              }),
            );
            panY.set(
              withSpring(commitUp ? -height * 1.15 : 0, {
                ...motion.spring.drag,
                velocity: event.velocityY,
                overshootClamping: true,
              }),
            );

            commitHaptic();
            scheduleOnRN(handleDecision, action);
          } else {
            panX.set(
              withSpring(0, {
                ...motion.spring.drag,
                velocity: event.velocityX,
              }),
            );
            panY.set(
              withSpring(0, {
                ...motion.spring.drag,
                velocity: event.velocityY,
              }),
            );
            animatedIndex.set(
              withSpring(currentIndex.get(), {
                ...motion.spring.settle,
                overshootClamping: true,
              }),
            );
          }
        })
        .onFinalize((_event, success) => {
          isDragging.set(false);
          if (success) return;
          // The OS stole the pan (incoming call, tab switch, a winning
          // recognizer): onEnd never runs, so return the card home here or it
          // stays stranded mid-drag with the hints overlay stuck visible.
          panX.set(withSpring(0, motion.spring.settle));
          panY.set(withSpring(0, motion.spring.settle));
          animatedIndex.set(
            withSpring(currentIndex.get(), {
              ...motion.spring.settle,
              overshootClamping: true,
            }),
          );
        }),
    [
      handleDecision,
      singleHapticOnChange,
      resetHaptic,
      commitHaptic,
      width,
      height,
      panDistanceX,
      panDistanceY,
      panX,
      panY,
      startX,
      startY,
      absoluteYAnchor,
      animatedIndex,
      currentIndex,
      isDragging,
    ],
  );

  const value = useMemo(
    () => ({
      panX,
      panY,
      absoluteYAnchor,
      panDistanceX,
      panDistanceY,
    }),
    [panX, panY, absoluteYAnchor, panDistanceX, panDistanceY],
  );

  return (
    <CardAnimationContext.Provider value={value}>
      <GestureDetector gesture={gesture}>{children}</GestureDetector>
    </CardAnimationContext.Provider>
  );
};

export const useCardAnimation = () => {
  const context = useContext(CardAnimationContext);
  if (!context) {
    throw new Error(
      "useCardAnimation must be used within a CardAnimationProvider",
    );
  }
  return context;
};
