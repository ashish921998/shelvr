import { saveSource } from "@/lib/city-pins";
import { t } from "@/lib/i18n";
import type { Id } from "@convex/_generated/dataModel";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

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
  /** The number on this save's map pin; a save with no located place has none. */
  number?: number;
  selected?: boolean;
  /** A place the user marked "We went": the badge fades like its pin. */
  /** Replaces opening the save, so the city page can select its pin first. */
  onPress?: () => void;
};

export function SaveRow({ item, number, selected, onPress }: Props) {
  const router = useRouter();
  const image = item.imageUrl ?? item.heroImageUrl;
  const source = saveSource(item);
  const title = item.title ?? t("homePlaces.untitled");
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ selected: selected === true }}
      onPress={
        onPress ??
        (() =>
          router.push({ pathname: "/item/[id]", params: { id: item._id } }))
      }
      style={({ pressed }) => [
        styles.row,
        selected && styles.selected,
        pressed && styles.pressed,
      ]}
    >
      {number !== undefined ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{number}</Text>
        </View>
      ) : null}
      {image ? (
        <Image
          source={{ uri: image }}
          style={styles.thumb}
          contentFit="cover"
        />
      ) : (
        <View style={styles.thumb} />
      )}
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
  );
}

const styles = StyleSheet.create((theme) => ({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.gap(1.5),
    padding: theme.gap(0.75),
    marginHorizontal: -theme.gap(0.75),
    borderRadius: theme.radius.lg,
    borderCurve: "continuous",
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
