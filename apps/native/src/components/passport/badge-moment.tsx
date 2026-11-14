import { AppSymbolIcon } from "@/components/symbol";
import { badgeEmoji, badgeGoal, badgeName } from "@/lib/badge-copy";
import { useShareBadge } from "@/lib/badges";
import { t } from "@/lib/i18n";
import { fadeOut, motion } from "@/lib/motion";
import { BADGE_TIMING, type ShownBadge } from "@/lib/stamp-moment";
import { BADGES } from "@convex/model/badges";
import { useEffect } from "react";
import { Pressable, Text } from "react-native";
import Animated, {
  ReduceMotion,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

const MEDAL_SIZE = 120;
const KEEP = { reduceMotion: ReduceMotion.Never } as const;

function useFlip(reduced: boolean) {
  const turn = useSharedValue(reduced ? 1 : 0);
  const fade = useSharedValue(0);
  useEffect(() => {
    fade.set(withTiming(1, { ...motion.timing.fade, ...KEEP }));
    if (reduced) return;
    turn.set(
      withTiming(1, {
        duration: BADGE_TIMING.flip,
        easing: motion.easing.out,
        ...KEEP,
      }),
    );
  }, [reduced, turn, fade]);
  const medal = useAnimatedStyle(() => {
    const landed = turn.get();
    return {
      opacity: fade.get(),
      transform: [
        { perspective: 600 },
        { rotateY: `${(1 - landed) * 90}deg` },
        { scale: 0.85 + landed * 0.15 },
      ],
    };
  });
  const card = useAnimatedStyle(() => ({ opacity: fade.get() }));
  return { medal, card };
}

export function BadgeMomentView({
  shown,
  onDismiss,
}: {
  shown: ShownBadge;
  onDismiss: () => void;
}) {
  const reduced = useReducedMotion();
  const { theme } = useUnistyles();
  const { medal, card } = useFlip(reduced);
  const share = useShareBadge("moment");
  const badge = BADGES.find((entry) => entry.id === shown.badge);
  if (badge === undefined) return null;
  return (
    <Animated.View
      testID="badge-moment"
      exiting={fadeOut}
      pointerEvents="box-none"
      style={styles.overlay}
    >
      <Pressable
        testID="badge-moment-dismiss"
        accessible={false}
        onPress={onDismiss}
        style={styles.moment}
      >
        <Animated.View style={[styles.medal, medal]}>
          <Text style={styles.emoji}>{badgeEmoji(badge.id)}</Text>
        </Animated.View>
        <Animated.View style={[styles.card, card]}>
          <Text style={styles.kicker}>{t("badges.earned")}</Text>
          <Text style={styles.name} numberOfLines={2}>
            {badgeName(badge.id)}
          </Text>
          <Text style={styles.goal} numberOfLines={2}>
            {badgeGoal(badge)}
          </Text>
          {shown.more > 0 ? (
            <Text style={styles.goal}>
              {t("badges.moreEarned", { count: shown.more })}
            </Text>
          ) : null}
        </Animated.View>
      </Pressable>
      <Animated.View style={card}>
        <Pressable
          testID="badge-moment-share"
          accessibilityRole="button"
          accessibilityHint={t("badges.shareHint")}
          onPress={() => void share(badge.id)}
          style={({ pressed }) => [styles.share, pressed && styles.pressed]}
        >
          <AppSymbolIcon
            name="square.and.arrow.up"
            size={15}
            tintColor={theme.colors.background}
          />
          <Text style={styles.shareText}>{t("common.share")}</Text>
        </Pressable>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create((theme) => ({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    gap: theme.gap(2),
  },
  moment: {
    alignItems: "center",
    gap: theme.gap(2),
    paddingHorizontal: theme.gap(3),
  },
  medal: {
    width: MEDAL_SIZE,
    height: MEDAL_SIZE,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: MEDAL_SIZE / 2,
    borderWidth: 4,
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primarySoft,
    boxShadow: "0 6px 20px rgba(0, 0, 0, 0.18)",
  },
  emoji: { fontSize: theme.type.hero.fontSize },
  card: {
    maxWidth: 280,
    alignItems: "center",
    gap: theme.gap(0.25),
    paddingVertical: theme.gap(1.25),
    paddingHorizontal: theme.gap(2),
    borderRadius: theme.radius.lg,
    borderCurve: "continuous",
    backgroundColor: theme.colors.foreground,
    boxShadow: "0 6px 20px rgba(0, 0, 0, 0.18)",
  },
  kicker: {
    ...theme.type.captionStrong,
    color: theme.colors.background,
    textAlign: "center",
  },
  name: {
    ...theme.type.title,
    color: theme.colors.background,
    textAlign: "center",
  },
  goal: {
    ...theme.type.caption,
    color: theme.colors.background,
    textAlign: "center",
  },
  share: {
    minHeight: theme.control.minHeight,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.gap(0.75),
    paddingHorizontal: theme.gap(2.5),
    borderRadius: theme.radius.xl,
    borderCurve: "continuous",
    backgroundColor: theme.colors.foreground,
  },
  shareText: { ...theme.type.subheadStrong, color: theme.colors.background },
  pressed: { opacity: theme.opacity.pressed },
}));
