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
import { swipeDecision, type TidyAction } from "./swipe-decision";
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

// One provider per card scopes pan shared values to a single stack element,
// mirroring the Slack Catch Up recreation. The gesture commits horizontally
// (keep/delete) like the reference and adds an upward commit (save); the
// dominant projected axis on release wins, so a fast flick commits even
// when its translation is short.
export const CardAnimationProvider: FC<Props> = ({
  index,
  onDecision,
  children,
}) => {
  const { isDragging, animatedIndex, currentIndex, prevIndex } =
    useDeckAnimation();
  const { width, height } = useWindowDimensions();

  // Quarter-width matches the reference feel; the up-swipe threshold is a
  // taller fraction so accidental vertical drift doesn't trigger a save.
  const panDistanceX = width / 4;
  const panDistanceY = height / 5;

  const panX = useSharedValue(0);
  const panY = useSharedValue(0);
  // Offset the current drag continues from: a grab during a settle or fling
  // resumes the card where it visibly is instead of snapping to the origin.
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  // Grab point picks the rotation hinge direction (top half vs bottom half).
  const absoluteYAnchor = useSharedValue(0);

  const { singleHapticOnChange, resetHaptic, commitHaptic } =
    useSingleHapticOnPan({
      thresholdX: panDistanceX,
      thresholdY: panDistanceY,
    });

  const handleDecision = useCallback(
    (action: TidyAction) => {
      // Commit immediately. The fling runs on the UI thread via shared values,
      // so a JS-side state update here can't jank it — and deferring would make
      // rapid successive swipes feel laggy.
      onDecision(index, action);
    },
    [index, onDecision],
  );

  // Memoized so decision-driven re-renders (mount window, counters) hand
  // GestureDetector the SAME instance — a fresh instance re-attaches the
  // native handler and cancels any pan that is already in flight.
  const gesture = useMemo(
    () =>
      Gesture.Pan()
        .onBegin((event) => {
          // Stop any settle or fling still writing to these values, or the
          // running animation and the drag fight over the same shared value.
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
          // Travel from the card's rest position, not from the grab point, so a
          // re-grab mid-settle keeps deck progress consistent with where the
          // card visibly is.
          const x = startX.get() + event.translationX;
          const y = startY.get() + event.translationY;
          // Progress in card-index space: 1.0 of shift equals one card dismissed.
          // Horizontal and upward drags both advance; downward drag does not.
          const shift = Math.min(
            1,
            Math.max(
              Math.abs(x) / panDistanceX,
              Math.max(0, -y) / panDistanceY,
            ),
          );
          const progress = currentIndex.get() - shift;
          animatedIndex.set(
            progress < currentIndex.get() - 1
              ? currentIndex.get() - 1
              : progress,
          );

          panX.set(x);
          panY.set(y);

          singleHapticOnChange(x, y);
        })
        .onEnd((event, success) => {
          isDragging.set(false);
          // RNGH also calls onEnd for a FAILED or CANCELLED pan, with
          // success=false. Deciding from one would delete or keep a photo the
          // person never released, and onFinalize cannot recall a scheduled
          // decision — so leave a cancelled pan to its recovery below.
          if (!success) return;

          // onChange already parked the full-travel offsets on the pan values,
          // so the decision reads from there and folds in release velocity.
          const action = swipeDecision(
            panX.get(),
            panY.get(),
            event.velocityX,
            event.velocityY,
            panDistanceX,
            panDistanceY,
          );

          if (action !== null) {
            prevIndex.set(Math.round(currentIndex.get()));
            currentIndex.set(Math.round(currentIndex.get() - 1));

            // Springs carry the release velocity and clamp overshoot, so the
            // card rides its own momentum off-screen and the deck index lands
            // without a bounce.
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
            // Spring home carrying the release velocity; the index can be
            // fractional, so settle it back to the card with clamped overshoot.
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
    // Shared values are stable refs; everything else is a stable callback or
    // a screen dimension.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      handleDecision,
      singleHapticOnChange,
      resetHaptic,
      commitHaptic,
      width,
      height,
      panDistanceX,
      panDistanceY,
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [panDistanceX, panDistanceY],
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
