import { t, useAppLocale } from "@/lib/i18n";
import { InlineCard } from "@/components/ui/inline-card";
import { RECALL_MAX_SHOWN } from "@/lib/save-recall";
import { displayHost } from "@/lib/url";
import type { api } from "@convex/_generated/api";
import type { FunctionReturnType } from "convex/server";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { Text, View } from "react-native";
import { Pressable } from "react-native-gesture-handler";
import { StyleSheet } from "react-native-unistyles";

type RecallItem = FunctionReturnType<typeof api.items.similarItems>[number];

/**
 * The save recall card on Home: older saves that go with the one just added.
 * Purely presentational; the hook in lib/use-save-recall.ts owns when it shows
 * and its analytics.
 */
export function SaveRecallCard({
  matches,
  onOpen,
  onDismiss,
}: {
  matches: RecallItem[];
  onOpen: () => void;
  onDismiss: () => void;
}) {
  useAppLocale();
  // The count names only the saves the card can open, so it never promises
  // more than the thumbnails deliver.
  const shown = matches.slice(0, RECALL_MAX_SHOWN);
  return (
    <InlineCard
      testID="save-recall-card"
      title={t("home.recallTitle")}
      body={t("home.recallBody", { count: shown.length })}
    >
      <View style={styles.row}>
        {shown.map((item) => (
          <RecallThumb key={item._id} item={item} onOpen={onOpen} />
        ))}
      </View>
      <View style={styles.buttonRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("common.notNow")}
          style={({ pressed }) => [
            styles.secondaryButton,
            pressed && { opacity: 0.7 },
          ]}
          onPress={onDismiss}
        >
          <Text style={styles.secondaryButtonText}>{t("common.notNow")}</Text>
        </Pressable>
      </View>
    </InlineCard>
  );
}

function RecallThumb({
  item,
  onOpen,
}: {
  item: RecallItem;
  onOpen: () => void;
}) {
  const router = useRouter();
  const imageUri = item.imageUrl ?? item.heroImageUrl;
  const title =
    item.title ??
    item.note ??
    (item.url ? displayHost(item.url) : t("item.untitledItem"));
  // No `Link asChild` here: its Slot merges the child's style as an object, so
  // a Pressable style function is dropped on every platform and the thumbnail
  // loses its size. The card then collapsed into a tall empty box (first seen
  // on Android, and it reproduces on iOS too).
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={title}
      onPress={() => {
        onOpen();
        router.push({ pathname: "/item/[id]", params: { id: item._id } });
      }}
      style={({ pressed }) => [styles.thumb, pressed && { opacity: 0.7 }]}
    >
      {imageUri ? (
        <Image
          source={{ uri: imageUri }}
          recyclingKey={item._id}
          contentFit={item.isSticker ? "contain" : "cover"}
          style={styles.thumbImage}
        />
      ) : (
        <View style={styles.thumbTextFace}>
          <Text style={styles.thumbTitle} numberOfLines={4}>
            {title}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create((theme) => ({
  row: {
    flexDirection: "row",
    gap: theme.gap(1),
    marginTop: theme.gap(0.5),
  },
  thumb: {
    flex: 1,
    aspectRatio: 1,
    maxWidth: 104,
    borderRadius: theme.radius.md,
    borderCurve: "continuous",
    overflow: "hidden",
    backgroundColor: theme.colors.surfaceMuted,
  },
  thumbImage: {
    width: "100%",
    height: "100%",
  },
  thumbTextFace: {
    flex: 1,
    padding: theme.gap(1),
    justifyContent: "flex-end",
  },
  thumbTitle: {
    fontFamily: theme.fonts.medium,
    fontSize: 12,
    lineHeight: 15,
    color: theme.colors.foreground,
  },
  buttonRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
  },
  secondaryButton: {
    minHeight: 44,
    paddingHorizontal: theme.gap(2),
    borderRadius: theme.radius.md,
    borderCurve: "continuous",
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryButtonText: {
    fontFamily: theme.fonts.medium,
    fontSize: 14,
    color: theme.colors.muted,
  },
}));
