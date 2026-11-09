import { GoOutDice } from "@/components/go-out-art";
import { Button } from "@/components/ui/button";
import { AppSymbolIcon } from "@/components/symbol";
import { ThemedText } from "@/components/ui/themed-text";
import { analytics } from "@/lib/analytics";
import { directionsUrl } from "@/lib/date-plan";
import {
  GO_OUT_CATEGORIES,
  goOutMatches,
  rollPlace,
  type GoOutCategory,
  type GoOutPlace,
} from "@/lib/go-out";
import { haptics } from "@/lib/haptics";
import { t } from "@/lib/i18n";
import { KIND_LABELS } from "@/lib/map-filters";
import { KIND_EMOJI } from "@/lib/map-pin-emoji";
import { motion } from "@/lib/motion";
import { useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  View,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

function CategoryChip({
  label,
  count,
  selected,
  onPress,
}: {
  label: string;
  count: number;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={`${label}, ${count}`}
      accessibilityState={{
        selected,
        checked: selected,
        disabled: count === 0,
      }}
      disabled={count === 0}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        selected && styles.chipSelected,
        count === 0 && styles.disabled,
        pressed && styles.pressed,
      ]}
    >
      <ThemedText
        variant="subheadLabel"
        style={selected && styles.selectedText}
      >
        {label}
      </ThemedText>
      <ThemedText
        variant="subhead"
        style={selected ? styles.selectedText : styles.muted}
      >
        {count}
      </ThemedText>
    </Pressable>
  );
}

function PickResult({ place }: { place: GoOutPlace }) {
  const open = () => {
    void Linking.openURL(directionsUrl(place)).catch((error: unknown) =>
      analytics.captureError("go_out_directions_failed", error),
    );
  };
  return (
    <View style={styles.result} accessibilityLiveRegion="polite">
      <ThemedText variant="captionStrong" style={styles.muted}>
        {t("goOut.yourPick")}
      </ThemedText>
      <ThemedText variant="title" accessibilityRole="header">
        {place.name}
      </ThemedText>
      <Pressable
        accessibilityRole="button"
        onPress={open}
        style={styles.directions}
      >
        <ThemedText variant="secondaryLabel">
          ↗ {t("trip.directions")}
        </ThemedText>
      </Pressable>
    </View>
  );
}

export function GoOutPicker({
  places,
  city,
  loading,
  failed,
  onRetry,
  onClose,
  onBack,
}: {
  places: GoOutPlace[];
  city: string;
  loading: boolean;
  failed: boolean;
  onRetry: () => void;
  onClose: () => void;
  onBack: () => void;
}) {
  const { theme } = useUnistyles();
  const [category, setCategory] = useState<GoOutCategory | null>(null);
  const [picked, setPicked] = useState<GoOutPlace | undefined>(undefined);
  const reduced = useReducedMotion();
  const rotation = useSharedValue(0);
  const diceStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.get()}deg` }],
  }));
  const matches = places.filter((place) => goOutMatches(place, category));
  const shown = picked && matches.includes(picked) ? picked : undefined;
  const choose = (value: GoOutCategory | null) => {
    setCategory(value);
    setPicked(undefined);
    void haptics.selection();
  };
  const roll = () => {
    if (matches.length === 0) return;
    setPicked(rollPlace(matches, shown));
    void haptics.impact();
    if (!reduced)
      rotation.set(
        withSequence(
          withTiming(-10, motion.timing.feedback),
          withTiming(10, motion.timing.feedback),
          withTiming(0, motion.timing.feedback),
        ),
      );
  };
  return (
    <View style={styles.screen}>
      <View style={styles.topbar}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("common.back")}
          onPress={onBack}
          style={styles.back}
        >
          <AppSymbolIcon
            name="chevron.left"
            size={17}
            tintColor={theme.colors.foreground}
          />
          <ThemedText variant="secondaryLabel">{t("plan.goOut")}</ThemedText>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("common.close")}
          onPress={onClose}
          style={styles.close}
        >
          <AppSymbolIcon
            name="xmark"
            size={18}
            tintColor={theme.colors.foreground}
          />
        </Pressable>
      </View>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View
          style={[styles.hero, shown && styles.heroResult, diceStyle]}
        >
          <GoOutDice compact={shown !== undefined} />
        </Animated.View>
        {city ? (
          <ThemedText variant="label" style={styles.city}>
            {city}
          </ThemedText>
        ) : null}
        <ThemedText
          variant="displayTitle"
          accessibilityRole="header"
          style={styles.title}
        >
          {t("goOut.question")}
        </ThemedText>
        {loading ? (
          <ActivityIndicator
            color={theme.colors.foreground}
            style={styles.loading}
          />
        ) : failed ? (
          <Pressable
            accessibilityRole="button"
            onPress={onRetry}
            style={styles.result}
          >
            <ThemedText>{t("errors.tryAgain")}</ThemedText>
          </Pressable>
        ) : (
          <View accessibilityRole="radiogroup" style={styles.categories}>
            <CategoryChip
              label={t("goOut.any")}
              count={places.length}
              selected={category === null}
              onPress={() => choose(null)}
            />
            {GO_OUT_CATEGORIES.map((kind) => (
              <CategoryChip
                key={kind}
                label={`${KIND_EMOJI[kind]} ${t(KIND_LABELS[kind])}`}
                count={
                  places.filter((place) => goOutMatches(place, kind)).length
                }
                selected={category === kind}
                onPress={() => choose(kind)}
              />
            ))}
          </View>
        )}
        {shown ? (
          <PickResult place={shown} />
        ) : !loading && !failed && matches.length === 0 ? (
          <View style={styles.result}>
            <ThemedText variant="headline">{t("plan.emptyTitle")}</ThemedText>
            <ThemedText variant="subhead" style={styles.muted}>
              {t("map.emptyBody")}
            </ThemedText>
          </View>
        ) : null}
      </ScrollView>
      <View style={styles.footer}>
        <Button
          title={t(shown ? "goOut.rollAgain" : "goOut.roll")}
          disabled={loading || failed || matches.length === 0}
          onPress={roll}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  screen: {
    flex: 1,
    paddingTop: rt.insets.top,
    backgroundColor: theme.colors.background,
  },
  topbar: {
    minHeight: 48,
    paddingHorizontal: theme.gap(3),
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  close: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 24,
    backgroundColor: theme.colors.surface,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: theme.gap(3),
    paddingBottom: theme.gap(2),
    gap: theme.gap(2),
    alignItems: "center",
  },
  hero: {
    flexGrow: 1,
    minHeight: 220,
    justifyContent: "center",
    alignSelf: "center",
  },
  heroResult: { minHeight: 150 },
  city: { alignSelf: "flex-start" },
  title: { textAlign: "left", maxWidth: 320, alignSelf: "flex-start" },
  categories: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-start",
    gap: theme.gap(1),
    width: "100%",
  },
  chip: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.gap(1),
    paddingHorizontal: theme.gap(1.75),
    borderRadius: 24,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  chipSelected: {
    backgroundColor: theme.colors.primarySoft,
    borderColor: theme.colors.primary,
  },
  selectedText: { color: theme.colors.primaryText },
  disabled: { opacity: theme.opacity.disabled },
  muted: { color: theme.colors.muted },
  pressed: { opacity: theme.opacity.pressed },
  loading: { padding: theme.gap(3) },
  result: {
    width: "100%",
    borderRadius: theme.radius.xl,
    padding: theme.gap(2),
    gap: theme.gap(0.75),
    backgroundColor: theme.colors.surface,
  },
  directions: {
    minHeight: 44,
    justifyContent: "center",
    alignSelf: "flex-start",
  },
  footer: {
    paddingHorizontal: theme.gap(3),
    paddingTop: theme.gap(1),
    paddingBottom: Math.max(rt.insets.bottom, 16) + theme.gap(1),
  },
  back: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.gap(1),
    minHeight: theme.control.minHeight,
  },
}));
