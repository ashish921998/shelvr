import { t } from "@/lib/i18n";
import type { Id } from "@convex/_generated/dataModel";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

type SaveRowItem = {
  _id: Id<"items">;
  title?: string;
  imageUrl: string | null;
  heroImageUrl?: string;
  author?: string;
  siteName?: string;
};

export function SaveRow({ item }: { item: SaveRowItem }) {
  const router = useRouter();
  const image = item.imageUrl ?? item.heroImageUrl;
  const source = item.author ?? item.siteName;
  const title = item.title ?? t("homePlaces.untitled");
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={() =>
        router.push({ pathname: "/item/[id]", params: { id: item._id } })
      }
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
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
  row: { flexDirection: "row", alignItems: "center", gap: theme.gap(1.5) },
  pressed: { opacity: theme.opacity.pressed },
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
