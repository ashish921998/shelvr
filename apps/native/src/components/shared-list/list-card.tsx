import { AppSymbolIcon } from "@/components/symbol";
import { MemberAvatars } from "@/components/shared-list/member-avatars";
import { ThemedText } from "@/components/ui/themed-text";
import { t } from "@/lib/i18n";
import {
  activityLine,
  type SharedListSummary,
  withLine,
} from "@/lib/shared-lists";
import { useRouter } from "expo-router";
import { Pressable, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

export function SharedListCard({
  list,
  compact = false,
}: {
  list: SharedListSummary;
  compact?: boolean;
}) {
  const router = useRouter();
  const { theme } = useUnistyles();
  const detail = `${withLine(list.members)} · ${t("homePlaces.spotCount", { count: list.placeCount })}`;
  const activity = activityLine(list.newFrom ?? []);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[list.name, activity, detail]
        .filter(Boolean)
        .join(", ")}
      onPress={() =>
        router.push({ pathname: "/shared-list/[id]", params: { id: list._id } })
      }
      style={({ pressed }) => [
        styles.card,
        compact && styles.compact,
        pressed && styles.pressed,
      ]}
    >
      <MemberAvatars members={list.members} size={compact ? 28 : undefined} />
      <View style={styles.text}>
        <ThemedText variant="header" numberOfLines={1}>
          {list.name}
        </ThemedText>
        {activity ? (
          <ThemedText
            variant="secondaryLabel"
            style={styles.activity}
            numberOfLines={1}
          >
            {activity}
          </ThemedText>
        ) : (
          <ThemedText variant="footnote" style={styles.muted} numberOfLines={1}>
            {detail}
          </ThemedText>
        )}
      </View>
      {compact ? (
        <AppSymbolIcon
          name="chevron.right"
          size={14}
          tintColor={theme.colors.muted}
        />
      ) : null}
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
  compact: { paddingVertical: theme.gap(1), gap: theme.gap(1) },
  text: { flex: 1, gap: theme.gap(0.25) },
  muted: { color: theme.colors.muted },
  activity: { color: theme.colors.primaryText },
  pressed: { opacity: theme.opacity.pressed },
}));
