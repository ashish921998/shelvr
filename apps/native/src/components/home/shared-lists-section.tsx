import { MemberAvatars } from "@/components/shared-list/member-avatars";
import { AppSymbolIcon } from "@/components/symbol";
import { ThemedText } from "@/components/ui/themed-text";
import { withAlpha } from "@/lib/color";
import { t, useAppLocale } from "@/lib/i18n";
import {
  type SharedListSummary,
  useSharedLists,
  withLine,
} from "@/lib/shared-lists";
import { useRouter } from "expo-router";
import { Pressable, ScrollView, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

function ListTile({ list }: { list: SharedListSummary }) {
  const router = useRouter();
  const places = t("homePlaces.spotCount", { count: list.placeCount });
  const fresh =
    list.newCount > 0
      ? t("sharedLists.newCount", { count: list.newCount })
      : null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[
        list.name,
        `${withLine(list.members)} · ${places}`,
        fresh,
      ]
        .filter(Boolean)
        .join(", ")}
      onPress={() =>
        router.push({ pathname: "/shared-list/[id]", params: { id: list._id } })
      }
      style={({ pressed }) => [
        styles.tile,
        styles.listTile,
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.tileTop}>
        <MemberAvatars members={list.members} size={28} />
        {fresh ? (
          <View style={styles.badge}>
            <ThemedText variant="captionStrong" style={styles.badgeText}>
              {fresh}
            </ThemedText>
          </View>
        ) : null}
      </View>
      <View>
        <ThemedText variant="header" numberOfLines={2}>
          {list.name}
        </ThemedText>
        <ThemedText variant="caption" style={styles.muted} numberOfLines={1}>
          {places}
        </ThemedText>
      </View>
    </Pressable>
  );
}

export function SharedListsSection() {
  useAppLocale();
  const router = useRouter();
  const { theme } = useUnistyles();
  const lists = useSharedLists();
  return (
    <View style={styles.container}>
      <ThemedText
        variant="title"
        accessibilityRole="header"
        style={styles.heading}
      >
        {t("sharedLists.title")}
      </ThemedText>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.rail}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("sharedLists.start")}
          onPress={() => router.push("/new-shared-list")}
          style={({ pressed }) => [
            styles.tile,
            styles.startTile,
            pressed && styles.pressed,
          ]}
        >
          <AppSymbolIcon
            name="plus"
            size={24}
            tintColor={theme.colors.foreground}
          />
          <ThemedText variant="subheadLabel" style={styles.startLabel}>
            {t("sharedLists.start")}
          </ThemedText>
        </Pressable>
        {lists.data?.map((list) => (
          <ListTile key={list._id} list={list} />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: { gap: theme.gap(1.5), paddingTop: theme.gap(3) },
  heading: { paddingHorizontal: theme.gap(2) },
  rail: { gap: theme.gap(1.5), paddingHorizontal: theme.gap(2) },
  tile: {
    width: 148,
    height: 132,
    padding: theme.gap(1.5),
    borderRadius: theme.radius.lg,
  },
  listTile: {
    justifyContent: "space-between",
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  startTile: {
    alignItems: "center",
    justifyContent: "center",
    gap: theme.gap(1),
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: withAlpha(theme.colors.muted, 0.5),
    backgroundColor: theme.colors.surfaceMuted,
  },
  startLabel: { textAlign: "center" },
  tileTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  badge: {
    paddingVertical: theme.gap(0.25),
    paddingHorizontal: theme.gap(0.75),
    borderRadius: theme.radius.sm,
    borderCurve: "continuous",
    backgroundColor: theme.colors.primarySoft,
  },
  badgeText: { color: theme.colors.primaryText },
  muted: { color: theme.colors.muted },
  pressed: { opacity: theme.opacity.pressed },
}));
