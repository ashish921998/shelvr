import { AppSymbolIcon } from "@/components/symbol";
import { saveSource } from "@/lib/city-pins";
import { t } from "@/lib/i18n";
import type { Id } from "@convex/_generated/dataModel";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

type SaveRowItem = {
  _id: Id<"items">;
  title?: string;
  url?: string;
  imageUrl: string | null;
  heroImageUrl?: string;
  author?: string;
  siteName?: string;
};

type Props = {
  item: SaveRowItem;
  placeName?: string;
  /** The matching map number when this row represents a located place. */
  number?: number;
  selected?: boolean;
  /** Replaces opening the save, so the city page can select its pin first. */
  onPress?: () => void;
  /** Opens Apple's place card; its button shows while the row is selected. */
  onPlaceDetails?: () => void;
  onRemove?: () => void;
  removing?: boolean;
};

export function SaveRow({
  item,
  placeName,
  number,
  selected,
  onPress,
  onPlaceDetails,
  onRemove,
  removing,
}: Props) {
  const router = useRouter();
  const { theme } = useUnistyles();
  const image = item.imageUrl ?? item.heroImageUrl;
  const source = placeName
    ? (item.title ?? saveSource(item))
    : saveSource(item);
  const title = placeName ?? item.title ?? t("homePlaces.untitled");
  return (
    <View style={[styles.row, selected && styles.selected]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={title}
        accessibilityState={{ selected: selected === true }}
        onPress={
          onPress ??
          (() =>
            router.push({ pathname: "/item/[id]", params: { id: item._id } }))
        }
        style={({ pressed }) => [styles.body, pressed && styles.pressed]}
      >
        {number !== undefined ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{number}</Text>
          </View>
        ) : null}
        {!placeName ? (
          image ? (
            <Image
              source={{ uri: image }}
              style={styles.thumb}
              contentFit="cover"
            />
          ) : (
            <View style={styles.thumb} />
          )
        ) : null}
        <View style={styles.text}>
          <Text style={styles.title} numberOfLines={2}>
            {title}
          </Text>
          {source ? (
            <Text style={styles.source} numberOfLines={1}>
              {source}
            </Text>
          ) : null}
        </View>
      </Pressable>
      {selected && onRemove ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("cityMap.removePlace", { name: title })}
          disabled={removing}
          onPress={onRemove}
          style={styles.details}
        >
          <Text style={styles.title}>−</Text>
        </Pressable>
      ) : null}
      {selected && onPlaceDetails ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("cityMap.placeDetails", { name: title })}
          onPress={onPlaceDetails}
          style={({ pressed }) => [styles.details, pressed && styles.pressed]}
        >
          <AppSymbolIcon
            name="info.circle"
            size={22}
            tintColor={theme.colors.foreground}
          />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  row: {
    minHeight: theme.control.minHeight,
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: -theme.gap(0.75),
    borderRadius: theme.radius.lg,
    borderCurve: "continuous",
  },
  body: {
    flex: 1,
    alignSelf: "stretch",
    flexDirection: "row",
    alignItems: "center",
    gap: theme.gap(1.5),
    padding: theme.gap(0.75),
  },
  details: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  selected: { backgroundColor: theme.colors.primarySoft },
  pressed: { opacity: theme.opacity.pressed },
  badge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.primary,
  },
  badgeText: { ...theme.type.badge, color: theme.colors.onTint },
  thumb: {
    width: 56,
    height: 56,
    borderRadius: theme.radius.md,
    borderCurve: "continuous",
    backgroundColor: theme.colors.surfaceMuted,
  },
  text: { flex: 1, gap: theme.gap(0.25) },
  title: { ...theme.type.subheadStrong, color: theme.colors.foreground },
  source: { ...theme.type.footnote, color: theme.colors.muted },
}));
