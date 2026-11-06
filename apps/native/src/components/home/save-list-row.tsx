import { AppSymbolIcon } from "@/components/symbol";
import { ActionMenu } from "@/components/ui/action-menu";
import { ThemedText } from "@/components/ui/themed-text";
import type { DetailItem } from "@/components/item-detail";
import { t, useAppLocale } from "@/lib/i18n";
import { saveDetail, saveEmoji } from "@/lib/save-list";
import { useSaveActions } from "@/lib/use-save-actions";
import { displayHost } from "@/lib/url";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { memo } from "react";
import { Pressable, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

export type SaveListItem = DetailItem;

function SaveMenu({ save, title }: { save: SaveListItem; title: string }) {
  const { theme } = useUnistyles();
  const { actions } = useSaveActions(save, "feed");
  return (
    <ActionMenu
      label={`${t("item.actions")}, ${title}`}
      title={title}
      actions={actions}
      style={styles.menu}
    >
      <View style={styles.dots}>
        <AppSymbolIcon
          name="ellipsis"
          size={18}
          tintColor={theme.colors.foreground}
        />
      </View>
    </ActionMenu>
  );
}

export const SaveListRow = memo(function SaveListRow({
  save,
}: {
  save: SaveListItem;
}) {
  useAppLocale();
  const router = useRouter();
  const reading = save.status === "processing";
  const image = reading ? undefined : (save.imageUrl ?? save.heroImageUrl);
  const title = reading
    ? displayHost(save.url) || t("homePlaces.untitled")
    : save.title?.trim() || t("homePlaces.untitled");
  const detail = saveDetail(save);
  const emoji = saveEmoji(save);
  return (
    <View style={styles.row}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${title}, ${detail}`}
        onPress={() =>
          router.push({
            pathname: "/item/[id]",
            params: { id: save._id, from: "home" },
          })
        }
        style={({ pressed }) => [styles.body, pressed && styles.pressed]}
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
          <ThemedText style={styles.title} numberOfLines={1}>
            {title}
          </ThemedText>
          <ThemedText style={styles.detail} numberOfLines={1}>
            {emoji ? `${emoji} ${detail}` : detail}
          </ThemedText>
        </View>
      </Pressable>
      <SaveMenu save={save} title={title} />
    </View>
  );
});

const styles = StyleSheet.create((theme) => ({
  row: {
    height: 62,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: theme.gap(2),
  },
  body: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
  },
  pressed: { opacity: theme.opacity.pressed },
  thumb: {
    width: 62,
    height: 62,
    borderRadius: 6,
    borderCurve: "continuous",
    backgroundColor: theme.colors.surfaceMuted,
  },
  text: { flex: 1, minWidth: 0, gap: 2 },
  title: { fontSize: 16.5, lineHeight: 21 },
  detail: { fontSize: 13.3, lineHeight: 17, color: theme.colors.muted },
  menu: {
    width: 44,
    height: 44,
    marginRight: -9,
    alignItems: "center",
    justifyContent: "center",
  },
  dots: { transform: [{ rotate: "90deg" }] },
}));
