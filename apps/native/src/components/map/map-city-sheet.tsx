import { CitySheet } from "@/components/city/city-sheet";
import { ThemedText } from "@/components/ui/themed-text";
import type { SheetSnaps } from "@/lib/city-sheet";
import { formatRecentDate } from "@/lib/date";
import { t, useAppLocale } from "@/lib/i18n";
import {
  citySummary,
  recentSaves,
  saveCover,
  type SheetSave,
} from "@/lib/map-city-sheet";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import type { ReactNode } from "react";
import { Pressable, ScrollView, View } from "react-native";
import Animated, {
  interpolate,
  type SharedValue,
  useAnimatedStyle,
} from "react-native-reanimated";
import { StyleSheet } from "react-native-unistyles";

type Props = {
  city: string;
  saves: SheetSave[];
  places: number;
  snaps: SheetSnaps;
  top: SharedValue<number>;
  bottomInset: number;
  onHeaderHeight: (height: number) => void;
};

export function MapCitySheet({
  city,
  saves,
  places,
  snaps,
  top,
  bottomInset,
  onHeaderHeight,
}: Props) {
  useAppLocale();
  const router = useRouter();
  const recent = recentSaves(saves);
  const recentShown = useAnimatedStyle(() => ({
    opacity: interpolate(
      top.get(),
      [snaps.expanded, snaps.middle],
      [1, 0],
      "clamp",
    ),
  }));
  const openSave = (id: string) =>
    router.push({ pathname: "/item/[id]", params: { id } });

  return (
    <CitySheet
      snaps={snaps}
      top={top}
      onHeaderHeight={onHeaderHeight}
      header={
        <View style={styles.header}>
          <View style={styles.heading}>
            <ThemedText variant="cityHeading" numberOfLines={1}>
              {city}
            </ThemedText>
            <ThemedText variant="footnote" style={styles.muted}>
              {citySummary(saves.length, places)}
            </ThemedText>
          </View>
        </View>
      }
      list={(scroll) => (
        <Animated.ScrollView
          scrollEnabled={scroll.scrollEnabled}
          onScroll={scroll.onScroll}
          scrollEventThrottle={16}
          bounces={scroll.bounces}
          contentContainerStyle={{ paddingBottom: bottomInset }}
        >
          {recent.length > 0 ? (
            <Animated.View style={recentShown}>
              <Section
                title={t("mapSheet.recentlySaved")}
                action={t("navigation.library")}
                onAction={() => router.push("/(app)/(tabs)/(home)")}
              />
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.row}
              >
                {recent.map((save) => (
                  <RecentCover key={save._id} save={save} onPress={openSave} />
                ))}
              </ScrollView>
            </Animated.View>
          ) : null}
        </Animated.ScrollView>
      )}
    />
  );
}

function Section({
  title,
  action,
  onAction,
}: {
  title: string;
  action: string;
  onAction: () => void;
}) {
  return (
    <View style={styles.section}>
      <ThemedText variant="headline">{title}</ThemedText>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={action}
        hitSlop={12}
        onPress={onAction}
      >
        <ThemedText variant="subheadStrong" style={styles.action}>
          {action}
        </ThemedText>
      </Pressable>
    </View>
  );
}

function Cover({
  save,
  style,
  children,
}: {
  save: SheetSave;
  style: object;
  children?: ReactNode;
}) {
  const cover = saveCover(save);
  return (
    <View style={[styles.cover, style]}>
      {cover ? (
        <Image
          source={cover}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          accessibilityIgnoresInvertColors
        />
      ) : null}
      {children}
    </View>
  );
}

function RecentCover({
  save,
  onPress,
}: {
  save: SheetSave;
  onPress: (id: string) => void;
}) {
  const date = formatRecentDate(save._creationTime);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${save.title ?? t("homePlaces.untitled")}, ${date}`}
      onPress={() => onPress(save._id)}
      style={({ pressed }) => pressed && styles.pressed}
    >
      <Cover save={save} style={styles.recent}>
        <View style={styles.dateScrim}>
          <ThemedText variant="captionStrong" style={styles.date}>
            {date}
          </ThemedText>
        </View>
      </Cover>
    </Pressable>
  );
}

const styles = StyleSheet.create((theme) => ({
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.gap(1.5),
    paddingHorizontal: theme.gap(0.5),
    paddingBottom: theme.gap(1.5),
  },
  heading: { flex: 1, gap: theme.gap(0.25) },
  muted: { color: theme.colors.muted },
  pressed: { opacity: theme.opacity.pressed },
  section: {
    height: 36,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: theme.gap(2.5),
    marginTop: theme.gap(0.5),
  },
  action: { color: theme.colors.primaryText },
  row: {
    gap: theme.gap(1.5),
    paddingHorizontal: theme.gap(2.5),
    paddingVertical: theme.gap(1),
  },
  cover: {
    overflow: "hidden",
    backgroundColor: theme.colors.surfaceMuted,
    borderRadius: theme.radius.sm,
    borderCurve: "continuous",
  },
  recent: { width: 68, height: 92, justifyContent: "flex-end" },
  dateScrim: {
    backgroundColor: theme.colors.overlay,
    paddingHorizontal: theme.gap(0.75),
    paddingVertical: theme.gap(0.25),
  },
  date: { color: theme.colors.onOverlay },
}));
