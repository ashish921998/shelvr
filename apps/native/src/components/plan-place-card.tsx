import { AppSymbolIcon } from "@/components/symbol";
import { ThemedText } from "@/components/ui/themed-text";
import { t, useAppLocale } from "@/lib/i18n";
import type { PlanPlace } from "@/lib/make-plan";
import { Image } from "expo-image";
import { Pressable, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

type Props = {
  place: PlanPlace;
  rank: number;
  /** The save the place came from, shown so the plan reads as yours. */
  sourceImageUrl?: string;
  /** Shown instead when the save has no image, such as a note. */
  sourceTitle?: string;
  highlighted: boolean;
  onOpenMaps: () => void;
};

/** One place on a plan: rank, name, area, why, its source save, and Maps. */
export function PlanPlaceCard({
  place,
  rank,
  sourceImageUrl,
  sourceTitle,
  highlighted,
  onOpenMaps,
}: Props) {
  useAppLocale();
  const { theme } = useUnistyles();
  return (
    <Animated.View
      // Five cards, mounted once per plan: not a recycled list row.
      entering={FadeInDown.delay(rank * 70).duration(
        theme.motion.duration.enter,
      )}
      style={[styles.card, highlighted && styles.highlighted]}
    >
      <View style={styles.row}>
        <ThemedText variant="title" style={styles.rank}>
          {String(rank)}
        </ThemedText>
        <View style={styles.body}>
          <ThemedText variant="header" numberOfLines={2}>
            {place.name}
          </ThemedText>
          {place.area ? (
            <ThemedText variant="caption" style={styles.muted}>
              {place.area}
            </ThemedText>
          ) : null}
          <ThemedText variant="subhead" style={styles.why}>
            {place.why}
          </ThemedText>
          {!sourceImageUrl && sourceTitle ? (
            <ThemedText
              variant="caption"
              style={styles.muted}
              numberOfLines={1}
            >
              {t("plan.from", { title: sourceTitle })}
            </ThemedText>
          ) : null}
        </View>
        {sourceImageUrl ? (
          <Image
            source={{ uri: sourceImageUrl }}
            style={styles.thumb}
            contentFit="cover"
            accessible={false}
          />
        ) : null}
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("plan.openMapsFor", { name: place.name })}
        onPress={onOpenMaps}
        hitSlop={8}
        style={({ pressed }) => [
          styles.maps,
          // The card turns primarySoft when highlighted; keep the pill visible.
          highlighted && styles.mapsOnHighlight,
          pressed && styles.pressed,
        ]}
      >
        <AppSymbolIcon
          name="map"
          size={14}
          tintColor={theme.colors.primaryText}
        />
        <ThemedText variant="labelStrong" style={styles.mapsText}>
          {t("plan.openMaps")}
        </ThemedText>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create((theme) => ({
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    padding: theme.gap(2),
    gap: theme.gap(1.5),
  },
  highlighted: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primarySoft,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: theme.gap(1.5),
  },
  rank: {
    color: theme.colors.primaryText,
    minWidth: theme.gap(2),
  },
  body: {
    flex: 1,
    gap: theme.gap(0.25),
  },
  muted: {
    color: theme.colors.muted,
  },
  why: {
    marginTop: theme.gap(0.5),
    color: theme.colors.foreground,
  },
  thumb: {
    width: theme.gap(6),
    height: theme.gap(8),
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.surfaceMuted,
  },
  maps: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: theme.gap(0.75),
    backgroundColor: theme.colors.primarySoft,
    borderRadius: 999,
    paddingVertical: theme.gap(0.75),
    paddingHorizontal: theme.gap(1.5),
    marginLeft: theme.gap(3.5),
  },
  mapsOnHighlight: {
    backgroundColor: theme.colors.surface,
  },
  mapsText: {
    color: theme.colors.primaryText,
  },
  pressed: {
    opacity: theme.opacity.pressed,
  },
}));
