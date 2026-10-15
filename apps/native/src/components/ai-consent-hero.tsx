import { AppSymbolIcon, type AppSymbolName } from "@/components/symbol";
import { ThemedText } from "@/components/ui/themed-text";
import { t } from "@/lib/i18n";
import { withAlpha } from "@/lib/color";
import { useEffect } from "react";
import { View } from "react-native";
import Animated, {
  Easing,
  interpolateColor,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

// One save, drawn the way the feed draws it, turning from what arrived (a
// bare address, a note, a photo with no name) into what the shelf shows: a
// title and tags. It plays once, then rests on the finished save. With
// Reduce Motion on, only the finished save is drawn.

type HeroSave = {
  type: "image" | "link" | "note";
  title: string;
  url?: string;
  note?: string;
  tags: string[];
};

const HERO_TAGS = 3;
const TOTAL_MS = 3200;
// Beats as fractions of the whole, so one timing drives every part.
export const HERO_BEATS = {
  scan: [700 / TOTAL_MS, 1500 / TOTAL_MS],
  reveal: [1400 / TOTAL_MS, 1900 / TOTAL_MS],
  tag: (index: number) =>
    [2000 + index * 150, 2320 + index * 150].map((ms) => ms / TOTAL_MS),
} as const;
const SCAN_WIDTH = 56;

/** Eased progress of one beat, 0 before it starts and 1 once it is over. */
export function beat(progress: number, from: number, to: number): number {
  "worklet";
  const x = Math.min(1, Math.max(0, (progress - from) / (to - from)));
  return 1 - (1 - x) ** 3;
}

const RAW_ICON: Record<HeroSave["type"], AppSymbolName> = {
  link: "link",
  note: "square.and.pencil",
  image: "photo.on.rectangle",
};

/** The example shown to someone with no titled save yet. The address is
 * made up to match the sample title onboarding already uses. */
export function builtInSave(): HeroSave {
  return {
    type: "link",
    title: t("onboarding.sampleRamen"),
    url: "bbcgoodfood.com/recipes/salmon-ramen",
    tags: [
      t("aiConsent.heroTagDinner"),
      t("aiConsent.heroTagNoodles"),
      t("aiConsent.heroTagWeeknight"),
    ],
  };
}

export function AiConsentHero({
  save,
  own,
}: {
  save: HeroSave;
  /** The save is the person's own, so the hero says where it came from. */
  own: boolean;
}) {
  const { theme } = useUnistyles();
  const reducedMotion = useReducedMotion();
  const progress = useSharedValue(reducedMotion ? 1 : 0);
  const width = useSharedValue(0);

  useEffect(() => {
    if (reducedMotion) return;
    progress.value = withTiming(1, {
      duration: TOTAL_MS,
      easing: Easing.linear,
    });
  }, [progress, reducedMotion]);

  const [scanFrom, scanTo] = HERO_BEATS.scan;
  const [revealFrom, revealTo] = HERO_BEATS.reveal;
  const scan = useAnimatedStyle(() => {
    const p = beat(progress.value, scanFrom, scanTo);
    return {
      opacity: p === 0 || p === 1 ? 0 : 1,
      transform: [{ translateX: -SCAN_WIDTH + (width.value + SCAN_WIDTH) * p }],
    };
  });
  const ghost = useAnimatedStyle(() => ({
    opacity: 1 - beat(progress.value, revealFrom, revealTo),
  }));
  const title = useAnimatedStyle(() => {
    const p = beat(progress.value, revealFrom, revealTo);
    return { opacity: p, transform: [{ translateY: 6 * (1 - p) }] };
  });
  const thumb = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      beat(progress.value, revealFrom, revealTo),
      [0, 1],
      [theme.colors.surfaceMuted, theme.colors.primarySoft],
    ),
  }));
  const rawIcon = useAnimatedStyle(() => ({
    opacity: 1 - beat(progress.value, scanFrom, scanFrom + 0.05),
  }));
  const sparkle = useAnimatedStyle(() => ({
    opacity:
      beat(progress.value, scanFrom, scanFrom + 0.05) -
      beat(progress.value, revealFrom, revealTo),
  }));
  const check = useAnimatedStyle(() => ({
    opacity: beat(progress.value, revealFrom, revealTo),
  }));

  const raw =
    save.type === "note" ? save.note : save.url?.replace(/^https?:\/\//, "");
  return (
    <View
      style={styles.stage}
      accessible={own}
      accessibilityLabel={
        own ? `${t("aiConsent.example")}. ${save.title}` : undefined
      }
      accessibilityElementsHidden={!own}
      importantForAccessibility={own ? "yes" : "no-hide-descendants"}
    >
      {own ? (
        <ThemedText variant="label" style={styles.from}>
          {t("aiConsent.example")}
        </ThemedText>
      ) : null}
      <View
        style={styles.card}
        onLayout={(event) => {
          width.value = event.nativeEvent.layout.width;
        }}
      >
        <View style={styles.row}>
          <Animated.View style={[styles.thumb, thumb]}>
            <Animated.View style={[styles.icon, rawIcon]}>
              <AppSymbolIcon
                name={RAW_ICON[save.type]}
                size={20}
                tintColor={theme.colors.muted}
              />
            </Animated.View>
            <Animated.View style={[styles.icon, sparkle]}>
              <AppSymbolIcon
                name="sparkles"
                size={20}
                tintColor={theme.colors.primaryText}
              />
            </Animated.View>
            <Animated.View style={[styles.icon, check]}>
              <AppSymbolIcon
                name="checkmark"
                size={20}
                tintColor={theme.colors.primaryText}
              />
            </Animated.View>
          </Animated.View>
          <View style={styles.text}>
            <View>
              <Animated.View style={title}>
                <ThemedText variant="headline" numberOfLines={2}>
                  {save.title}
                </ThemedText>
              </Animated.View>
              <Animated.View style={[styles.ghost, styles.ghostTitle, ghost]} />
            </View>
            {raw ? (
              <ThemedText
                variant="caption"
                numberOfLines={1}
                style={styles.raw}
              >
                {raw}
              </ThemedText>
            ) : (
              <Animated.View style={[styles.ghost, styles.ghostMeta, ghost]} />
            )}
          </View>
        </View>
        <View style={styles.tags}>
          {save.tags.slice(0, HERO_TAGS).map((tag, index) => (
            <Tag key={tag} label={tag} index={index} progress={progress} />
          ))}
        </View>
        <Animated.View pointerEvents="none" style={[styles.scan, scan]} />
      </View>
    </View>
  );
}

function Tag({
  label,
  index,
  progress,
}: {
  label: string;
  index: number;
  progress: { value: number };
}) {
  const [from, to] = HERO_BEATS.tag(index);
  const style = useAnimatedStyle(() => {
    const p = beat(progress.value, from, to);
    return { opacity: p, transform: [{ scale: 0.85 + 0.15 * p }] };
  });
  return (
    <Animated.View style={[styles.tag, style]}>
      <ThemedText variant="label" style={styles.tagText}>
        {label}
      </ThemedText>
    </Animated.View>
  );
}

const styles = StyleSheet.create((theme) => ({
  stage: {
    gap: theme.gap(1.5),
    padding: theme.gap(2.5),
    borderRadius: theme.radius.xl,
    borderCurve: "continuous",
    backgroundColor: theme.colors.primarySoft,
  },
  from: { color: theme.colors.primaryText },
  card: {
    gap: theme.gap(1.5),
    padding: theme.gap(1.5),
    borderRadius: theme.radius.lg,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    overflow: "hidden",
  },
  row: { flexDirection: "row", alignItems: "center", gap: theme.gap(1.5) },
  thumb: {
    width: 48,
    height: 48,
    borderRadius: theme.radius.sm,
    borderCurve: "continuous",
    backgroundColor: theme.colors.surfaceMuted,
  },
  icon: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  text: { flex: 1, gap: theme.gap(0.5) },
  ghost: {
    height: 10,
    borderRadius: 5,
    backgroundColor: theme.colors.surfaceMuted,
  },
  // The title before it exists: a bar over the slot the words will land in,
  // centred so Dynamic Type never puts it off the text.
  ghostTitle: {
    position: "absolute",
    top: "50%",
    marginTop: -5,
    width: "62%",
  },
  ghostMeta: { width: "38%" },
  raw: { color: theme.colors.muted },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: theme.gap(1) },
  tag: {
    paddingHorizontal: theme.gap(1.25),
    paddingVertical: theme.gap(0.5),
    borderRadius: 999,
    backgroundColor: theme.colors.surfaceMuted,
  },
  tagText: { color: theme.colors.muted },
  scan: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    width: SCAN_WIDTH,
    experimental_backgroundImage: `linear-gradient(90deg, ${withAlpha(
      theme.colors.primary,
      0,
    )} 0%, ${withAlpha(theme.colors.primary, 0.35)} 50%, ${withAlpha(
      theme.colors.primary,
      0,
    )} 100%)`,
  },
}));
