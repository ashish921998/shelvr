import { t, useAppLocale } from "@/lib/i18n";
import { InlineCard } from "@/components/ui/inline-card";
import { RECALL_MAX_SHOWN } from "@/lib/save-recall";
import { displayHost } from "@/lib/url";
import type { api } from "@convex/_generated/api";
import type { FunctionReturnType } from "convex/server";
import { Image } from "expo-image";
import { Link } from "expo-router";
import { Pressable, Text, View } from "react-native";
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
  return (
    <InlineCard
      testID="save-recall-card"
      title={t("home.recallTitle")}
      body={t("home.recallBody", { count: matches.length })}
    >
      <View style={styles.row}>
        {matches.slice(0, RECALL_MAX_SHOWN).map((item) => (
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
  const imageUri = item.imageUrl ?? item.heroImageUrl;
  const title =
    item.title ??
    item.note ??
    (item.url ? displayHost(item.url) : t("item.untitledItem"));
  return (
    <Link href={{ pathname: "/item/[id]", params: { id: item._id } }} asChild>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={title}
        onPress={onOpen}
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
    </Link>
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
