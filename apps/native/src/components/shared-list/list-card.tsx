import { MemberAvatars } from "@/components/shared-list/member-avatars";
import { AppSymbolIcon } from "@/components/symbol";
import { ThemedText } from "@/components/ui/themed-text";
import { t } from "@/lib/i18n";
import { type SharedListSummary, withLine } from "@/lib/shared-lists";
import { useRouter } from "expo-router";
import { Pressable, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

export function SharedListCard({ list }: { list: SharedListSummary }) {
  const router = useRouter();
  const detail = `${withLine(list.members)} · ${t("homePlaces.spotCount", { count: list.placeCount })}`;
  const fresh =
    list.newCount > 0
      ? t("sharedLists.newCount", { count: list.newCount })
      : null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[list.name, detail, fresh].filter(Boolean).join(", ")}
      onPress={() =>
        router.push({ pathname: "/shared-list/[id]", params: { id: list._id } })
      }
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <MemberAvatars members={list.members} />
      <View style={styles.text}>
        <ThemedText variant="header" numberOfLines={1}>
          {list.name}
        </ThemedText>
        <ThemedText variant="footnote" style={styles.muted} numberOfLines={1}>
          {detail}
        </ThemedText>
      </View>
      {fresh ? (
        <View style={styles.badge}>
          <ThemedText variant="captionStrong" style={styles.badgeText}>
            {fresh}
          </ThemedText>
        </View>
      ) : null}
    </Pressable>
  );
}

export function StartListRow() {
  const router = useRouter();
  const { theme } = useUnistyles();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t("sharedLists.start")}
      onPress={() => router.push("/new-shared-list")}
      style={({ pressed }) => [styles.start, pressed && styles.pressed]}
    >
      <AppSymbolIcon
        name="plus"
        size={16}
        tintColor={theme.colors.primaryText}
      />
      <ThemedText variant="subheadStrong" style={styles.startLabel}>
        {t("sharedLists.start")}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create((theme) => ({
  card: {
    minHeight: theme.control.minHeight,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.gap(1.5),
    padding: theme.gap(1.5),
    borderRadius: theme.radius.lg,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  text: { flex: 1, gap: theme.gap(0.25) },
  muted: { color: theme.colors.muted },
  badge: {
    paddingVertical: theme.gap(0.5),
    paddingHorizontal: theme.gap(1.25),
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.primarySoft,
  },
  badgeText: { color: theme.colors.primaryText },
  start: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.gap(1),
  },
  startLabel: { color: theme.colors.primaryText },
  pressed: { opacity: theme.opacity.pressed },
}));
