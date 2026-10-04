import { AppSymbolIcon } from "@/components/symbol";
import { t } from "@/lib/i18n";
import { Image } from "expo-image";
import { Text, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  type SharedValue,
} from "react-native-reanimated";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { track, useLoop } from "../loop";

/*
 * Slide 3: a saved article gets its tags and its space. `shPop`, a 5 s loop:
 * chips pop in at 0.9 / 1.3 / 1.7 s (8 % each), the space pill at 2.4 s,
 * everything fades at 84–94 %.
 */

const PRAGUE = require("../../../../assets/onboarding/prague.jpg");
// A site name, the same in every language.
const DEMO_SOURCE = "theguardian.com";
const LOOP_MS = 5000;
const POP = 0.08;

function usePopStyle(progress: SharedValue<number>, start: number) {
  return useAnimatedStyle(() => {
    const p = progress.value;
    const shown = track(p, [start, start + POP], [0, 1]);
    const fade = track(p, [0.84, 0.94], [1, 0]);
    return {
      opacity: shown * fade,
      transform: [
        { translateY: track(p, [start, start + POP], [6, 0]) },
        { scale: track(p, [start, start + POP], [0.7, 1]) },
      ],
    };
  });
}

export function FilingSlide({ animate }: { animate: boolean }) {
  const { theme } = useUnistyles();
  const progress = useLoop(LOOP_MS, animate, 0.7);
  const chips = [
    { label: t("paywall.demoTagTravel"), style: usePopStyle(progress, 0.18) },
    { label: t("paywall.demoTagPrague"), style: usePopStyle(progress, 0.26) },
    { label: t("paywall.demoTagWeekend"), style: usePopStyle(progress, 0.34) },
  ];
  const pill = usePopStyle(progress, 0.48);

  return (
    <View style={styles.row}>
      <Image source={PRAGUE} style={styles.photo} contentFit="cover" />
      <View style={styles.column}>
        <Text style={styles.title}>{t("paywall.demoArticleTitle")}</Text>
        <Text style={styles.source}>{DEMO_SOURCE}</Text>
        <View style={styles.chips}>
          {chips.map((chip) => (
            <Animated.View key={chip.label} style={[styles.chip, chip.style]}>
              <Text style={styles.chipText}>{chip.label}</Text>
            </Animated.View>
          ))}
        </View>
        <Animated.View style={[styles.pill, pill]}>
          <AppSymbolIcon
            name="sparkles"
            size={14}
            tintColor={theme.colors.primaryText}
          />
          <Text style={styles.pillText} numberOfLines={1}>
            {t("paywall.demoFiledPill", { space: t("paywall.demoSpaceTrips") })}
          </Text>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  row: { flex: 1, flexDirection: "row", padding: 20, gap: 14 },
  photo: {
    width: 156,
    // Narrow phones keep half the row for the title, tags and pill.
    maxWidth: "50%",
    height: "100%",
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    borderColor: theme.colors.imageBorder,
  },
  column: { flex: 1, gap: 8 },
  title: {
    fontFamily: theme.fonts.bold,
    fontSize: 15,
    lineHeight: 19,
    color: theme.colors.foreground,
  },
  source: {
    fontFamily: theme.fonts.regular,
    fontSize: 12,
    color: theme.colors.muted,
  },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: {
    backgroundColor: theme.colors.surfaceMuted,
    borderRadius: 50,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  chipText: {
    fontFamily: theme.fonts.medium,
    fontSize: 12,
    color: theme.colors.muted,
  },
  pill: {
    marginTop: "auto",
    alignSelf: "flex-start",
    maxWidth: "100%",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: theme.colors.primarySoft,
    borderRadius: 50,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  pillText: {
    flexShrink: 1,
    fontFamily: theme.fonts.medium,
    fontSize: 13,
    color: theme.colors.primaryText,
  },
}));
