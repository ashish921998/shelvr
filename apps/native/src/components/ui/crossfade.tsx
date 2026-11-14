import { motion } from "@/lib/motion";
import { type ReactNode, useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  FadeIn,
  FadeOut,
  ReduceMotion,
  useReducedMotion,
} from "react-native-reanimated";

export function Crossfade({
  identity,
  children,
  duration = motion.duration.feedback,
}: {
  identity: string;
  children: ReactNode;
  duration?: number;
}) {
  const reduced = useReducedMotion();
  const ms = reduced ? motion.duration.feedback : duration;
  const [height, setHeight] = useState(0);
  const [frame, setFrame] = useState<{
    identity: string;
    children: ReactNode;
    previous: ReactNode;
    previousHeight: number;
    revision: number;
  }>({
    identity,
    children,
    previous: null,
    previousHeight: 0,
    revision: 0,
  });
  if (identity !== frame.identity) {
    setFrame({
      identity,
      children,
      previous: frame.children,
      previousHeight: height,
      revision: frame.revision + 1,
    });
  } else if (children !== frame.children) {
    setFrame({ ...frame, children });
  }
  useEffect(() => {
    if (!frame.previous) return;
    const timer = setTimeout(
      () => setFrame((current) => ({ ...current, previous: null })),
      ms,
    );
    return () => clearTimeout(timer);
  }, [frame.revision, frame.previous, ms]);
  return (
    <View
      style={frame.previous ? { minHeight: frame.previousHeight } : undefined}
    >
      {frame.previous ? (
        <Animated.View
          key={`previous-${frame.revision}`}
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={StyleSheet.absoluteFill}
          entering={FadeOut.duration(ms)
            .easing(motion.easing.out)
            .reduceMotion(ReduceMotion.Never)}
        >
          {frame.previous}
        </Animated.View>
      ) : null}
      <Animated.View
        key={frame.revision}
        entering={
          frame.revision
            ? FadeIn.duration(ms)
                .easing(motion.easing.out)
                .reduceMotion(ReduceMotion.Never)
            : undefined
        }
        onLayout={(event) => setHeight(event.nativeEvent.layout.height)}
      >
        {children}
      </Animated.View>
    </View>
  );
}
