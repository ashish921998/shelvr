import { BadgeMomentView } from "@/components/passport/badge-moment";
import { CityStampArt } from "@/components/passport/city-stamp";
import { StampArt } from "@/components/passport/stamp-sheet";
import { useBadgeUnlocks } from "@/lib/badges";
import { fadeOut, motion } from "@/lib/motion";
import {
  type ShownStamp,
  STAMP_TIMING,
  StampMomentPlayContext,
  useStampMomentPlayer,
} from "@/lib/stamp-moment";
import { type ReactNode, useEffect } from "react";
import { Pressable, Text, View } from "react-native";
import Animated, {
  ReduceMotion,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { StyleSheet } from "react-native-unistyles";

const STAMP_SIZE = 132;
const DROP_FROM = -180;
const TILT_FROM = -10;
const KEEP = { reduceMotion: ReduceMotion.Never } as const;

function useStampMotion(reduced: boolean) {
  const drop = useSharedValue(reduced ? 1 : 0);
  const squash = useSharedValue(0);
  const ring = useSharedValue(0);
  const fade = useSharedValue(0);
  const line = useSharedValue(0);

  useEffect(() => {
    if (reduced) {
      fade.set(withTiming(1, { ...motion.timing.fade, ...KEEP }));
      line.set(withTiming(1, { ...motion.timing.fade, ...KEEP }));
      return;
    }
    const {
      drop: dropMs,
      squash: squashMs,
      settle,
      ring: ringMs,
    } = STAMP_TIMING;
    fade.set(
      withTiming(1, {
        duration: dropMs / 2,
        easing: motion.easing.out,
        ...KEEP,
      }),
    );
    drop.set(
      withTiming(1, { duration: dropMs, easing: motion.easing.in, ...KEEP }),
    );
    squash.set(
      withDelay(
        dropMs,
        withSequence(
          withTiming(1, {
            duration: squashMs,
            easing: motion.easing.out,
            ...KEEP,
          }),
          withTiming(0, {
            duration: settle,
            easing: motion.easing.out,
            ...KEEP,
          }),
        ),
        ReduceMotion.Never,
      ),
    );
    ring.set(
      withDelay(
        dropMs,
        withTiming(1, { duration: ringMs, easing: motion.easing.out, ...KEEP }),
        ReduceMotion.Never,
      ),
    );
    line.set(
      withDelay(
        dropMs,
        withTiming(1, { ...motion.timing.enter, ...KEEP }),
        ReduceMotion.Never,
      ),
    );
  }, [reduced, drop, squash, ring, fade, line]);

  const stamp = useAnimatedStyle(() => {
    const landed = drop.get();
    const press = squash.get();
    return {
      opacity: fade.get(),
      transform: [
        { translateY: (1 - landed) * DROP_FROM },
        { rotate: `${(1 - landed) * TILT_FROM}deg` },
        { scaleX: 1 + press * 0.08 },
        { scaleY: 1 - press * 0.12 },
      ],
    };
  });
  const inkRing = useAnimatedStyle(() => {
    const spread = ring.get();
    return {
      opacity: spread === 0 ? 0 : 0.5 * (1 - spread),
      transform: [{ scale: 0.9 + spread * 0.6 }],
    };
  });
  const caption = useAnimatedStyle(() => ({ opacity: line.get() }));
  return { stamp, inkRing, caption };
}

function StampMomentView({
  shown,
  onDismiss,
}: {
  shown: ShownStamp;
  onDismiss: () => void;
}) {
  const reduced = useReducedMotion();
  const { stamp, inkRing, caption } = useStampMotion(reduced);
  return (
    <Animated.View
      exiting={fadeOut}
      pointerEvents="box-none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={styles.overlay}
    >
      <Pressable
        testID="stamp-moment"
        accessible={false}
        onPress={onDismiss}
        style={styles.moment}
      >
        <View style={styles.art}>
          {reduced ? null : (
            <Animated.View
              style={[
                styles.ring,
                shown.moment.kind === "city" && styles.roundRing,
                inkRing,
              ]}
            />
          )}
          <Animated.View style={stamp}>
            {shown.moment.kind === "city" ? (
              <CityStampArt
                name={shown.moment.city}
                country={null}
                size={STAMP_SIZE}
              />
            ) : (
              <StampArt
                cover={shown.moment.cover}
                ink={shown.ink}
                size={STAMP_SIZE}
              />
            )}
          </Animated.View>
        </View>
        <Animated.View style={[styles.pill, caption]}>
          <Text style={styles.line} numberOfLines={2}>
            {shown.line}
          </Text>
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}

export function StampMomentProvider({ children }: { children: ReactNode }) {
  const reduced = useReducedMotion();
  const { shown, controls, dismiss, badge, dismissBadge, unlock } =
    useStampMomentPlayer(reduced);
  useBadgeUnlocks(unlock);
  return (
    <StampMomentPlayContext value={controls}>
      {children}
      {shown ? (
        <StampMomentView key={shown.id} shown={shown} onDismiss={dismiss} />
      ) : badge ? (
        <BadgeMomentView
          key={badge.id}
          shown={badge}
          onDismiss={dismissBadge}
        />
      ) : null}
    </StampMomentPlayContext>
  );
}

const styles = StyleSheet.create((theme) => ({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  moment: {
    alignItems: "center",
    gap: theme.gap(2),
    paddingHorizontal: theme.gap(3),
  },
  art: {
    width: STAMP_SIZE,
    height: STAMP_SIZE,
    alignItems: "center",
    justifyContent: "center",
  },
  ring: {
    position: "absolute",
    width: STAMP_SIZE,
    height: STAMP_SIZE,
    borderRadius: theme.radius.lg,
    borderCurve: "continuous",
    borderWidth: 3,
    borderColor: theme.colors.primaryText,
  },
  roundRing: { borderRadius: STAMP_SIZE / 2 },
  pill: {
    maxWidth: 280,
    paddingVertical: theme.gap(1),
    paddingHorizontal: theme.gap(2),
    borderRadius: theme.radius.lg,
    borderCurve: "continuous",
    backgroundColor: theme.colors.foreground,
    boxShadow: "0 6px 20px rgba(0, 0, 0, 0.18)",
  },
  line: {
    ...theme.type.subheadStrong,
    color: theme.colors.background,
    textAlign: "center",
  },
}));
