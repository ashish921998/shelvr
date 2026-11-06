import { PillButton, ScalePressable } from "@/components/onboarding/parts";
import type { AhaSample } from "@/lib/aha-sample";
import { t, useAppLocale } from "@/lib/i18n";
import { placeEmoji } from "@/lib/map-pin-emoji";
import { SAMPLE_CITIES } from "@/lib/sample-cities";
import { HEADLINE_MAX_SCALE } from "@/lib/use-large-text";
import type { TextMessageKey } from "@/locales/message-types";
import { useRef, useState } from "react";
import { ScrollView, Text, View, type ScrollViewInstance } from "react-native";
import { useReducedMotion } from "react-native-reanimated";
import { StyleSheet } from "react-native-unistyles";

const MAP_PINS = [
  { emoji: "🍜", left: "12%", top: "28%" },
  { emoji: "☕", left: "62%", top: "18%" },
  { emoji: "🍷", left: "38%", top: "52%" },
  { emoji: "🌄", left: "74%", top: "60%" },
  { emoji: "🥐", left: "18%", top: "70%" },
] as const;

type Slide = {
  id: "together" | "eat" | "map";
  title: TextMessageKey;
};

const SLIDES: readonly Slide[] = [
  { id: "together", title: "onboardingCarousel.together" },
  { id: "eat", title: "onboardingCarousel.eat" },
  { id: "map", title: "onboardingCarousel.map" },
];

function Chip({ label, strong }: { label: string; strong?: boolean }) {
  return (
    <View style={[styles.chip, strong && styles.chipStrong]}>
      <Text style={styles.chipText}>{label}</Text>
    </View>
  );
}

function SpotRow({ emoji, name }: { emoji: string; name: string }) {
  return (
    <View style={styles.row}>
      <View style={styles.rowEmoji}>
        <Text style={styles.emoji}>{emoji}</Text>
      </View>
      <Text style={styles.rowName} numberOfLines={1}>
        {name}
      </Text>
    </View>
  );
}

function planLabel(sample: AhaSample): string {
  return t(
    sample.kind === "trip" ? "homePlaces.planTrip" : "homePlaces.planDate",
  );
}

function TogetherCard({ sample }: { sample: AhaSample }) {
  return (
    <View style={styles.cardBody}>
      <Text style={styles.cardTitle}>{t(SAMPLE_CITIES[sample.city].name)}</Text>
      <View style={styles.chips}>
        <Chip label={t("sharedLists.invite")} />
        <Chip label={planLabel(sample)} strong />
      </View>
      {sample.spots.map((spot) => (
        <SpotRow
          key={spot.name}
          emoji={placeEmoji({ name: spot.name, kinds: [] }) ?? "📍"}
          name={spot.name}
        />
      ))}
    </View>
  );
}

function EatCard({ sample }: { sample: AhaSample }) {
  return (
    <View style={styles.cardBody}>
      <Text style={styles.eyebrow}>{planLabel(sample)}</Text>
      {sample.spots.slice(0, 2).map((spot) => (
        <SpotRow
          key={spot.name}
          emoji={placeEmoji({ name: spot.name, kinds: [] }) ?? "📍"}
          name={spot.name}
        />
      ))}
      <Chip
        label={t(sample.kind === "date" ? "datePlan.send" : "common.share")}
        strong
      />
    </View>
  );
}

function MapCard() {
  return (
    <View style={styles.map}>
      <View style={styles.search}>
        <Text style={styles.searchText}>{t("map.searchPlaceholder")}</Text>
      </View>
      {MAP_PINS.map((pin) => (
        <View
          key={pin.emoji}
          style={[styles.pin, { left: pin.left, top: pin.top }]}
        >
          <Text style={styles.emoji}>{pin.emoji}</Text>
        </View>
      ))}
      <View style={styles.mapChips}>
        <Chip label={t("map.kindFood")} strong />
        <Chip label={t("map.kindCoffee")} />
      </View>
    </View>
  );
}

function Illustration({ id, sample }: { id: Slide["id"]; sample: AhaSample }) {
  if (id === "together") return <TogetherCard sample={sample} />;
  if (id === "eat") return <EatCard sample={sample} />;
  return <MapCard />;
}

export function CarouselStep({
  sample,
  onContinue,
}: {
  sample: AhaSample;
  onContinue: () => void;
}) {
  useAppLocale();
  const reduced = useReducedMotion();
  const scroll = useRef<ScrollViewInstance>(null);
  const [width, setWidth] = useState(0);
  const [page, setPage] = useState(0);
  const last = page === SLIDES.length - 1;

  const goTo = (index: number) => {
    scroll.current?.scrollTo({ x: index * width, animated: !reduced });
    setPage(index);
  };
  const next = () => {
    if (!last) goTo(page + 1);
  };

  return (
    <View
      style={styles.wrap}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
    >
      {width === 0 ? null : (
        <ScrollView
          ref={scroll}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={(event) =>
            setPage(Math.round(event.nativeEvent.contentOffset.x / width))
          }
          style={styles.pages}
        >
          {SLIDES.map((slide) => (
            <View key={slide.id} style={[styles.page, { width }]}>
              <Text
                style={styles.title}
                maxFontSizeMultiplier={HEADLINE_MAX_SCALE}
                accessibilityRole="header"
              >
                {t(slide.title)}
              </Text>
              <ScalePressable
                accessibilityRole="button"
                accessibilityLabel={t("onboardingCarousel.next")}
                disabled={last}
                onPress={next}
                style={styles.card}
              >
                <Illustration id={slide.id} sample={sample} />
              </ScalePressable>
            </View>
          ))}
        </ScrollView>
      )}
      <View style={styles.dots}>
        {SLIDES.map((slide, index) => (
          <View
            key={slide.id}
            style={[styles.dot, index === page && styles.dotOn]}
          />
        ))}
      </View>
      <PillButton
        label={t("common.continue")}
        onPress={last ? onContinue : next}
      />
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  wrap: { flex: 1, gap: theme.gap(2) },
  pages: { flex: 1 },
  page: { gap: theme.gap(3) },
  title: {
    ...theme.type.displayTitle,
    fontSize: 30,
    lineHeight: 34,
    color: theme.colors.foreground,
  },
  card: {
    overflow: "hidden",
    borderRadius: theme.radius.xl,
    borderCurve: "continuous",
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  cardBody: { padding: theme.gap(2), gap: theme.gap(1.5) },
  cardTitle: { ...theme.type.sheetTitle, color: theme.colors.foreground },
  eyebrow: {
    ...theme.type.captionStrong,
    textTransform: "uppercase",
    color: theme.colors.muted,
  },
  chips: { flexDirection: "row", gap: theme.gap(1) },
  chip: {
    alignSelf: "flex-start",
    paddingVertical: theme.gap(0.75),
    paddingHorizontal: theme.gap(1.5),
    borderRadius: 999,
    backgroundColor: theme.colors.surfaceMuted,
  },
  chipStrong: { backgroundColor: theme.colors.primary },
  chipText: { ...theme.type.labelStrong, color: theme.colors.foreground },
  row: { flexDirection: "row", alignItems: "center", gap: theme.gap(1.5) },
  rowEmoji: {
    width: 44,
    height: 44,
    borderRadius: theme.radius.md,
    borderCurve: "continuous",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.surfaceMuted,
  },
  emoji: { fontSize: 22 },
  rowName: {
    ...theme.type.subheadStrong,
    flex: 1,
    color: theme.colors.foreground,
  },
  map: { height: 320, backgroundColor: theme.colors.globeOcean },
  search: {
    margin: theme.gap(2),
    paddingVertical: theme.gap(1),
    paddingHorizontal: theme.gap(1.5),
    borderRadius: 999,
    backgroundColor: theme.colors.surface,
  },
  searchText: { ...theme.type.footnote, color: theme.colors.muted },
  pin: {
    position: "absolute",
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.surface,
  },
  mapChips: {
    position: "absolute",
    left: theme.gap(2),
    bottom: theme.gap(2),
    flexDirection: "row",
    gap: theme.gap(1),
  },
  dots: { flexDirection: "row", justifyContent: "center", gap: 6 },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.colors.border,
  },
  dotOn: { width: 20, backgroundColor: theme.colors.primary },
}));
