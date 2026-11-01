import { MemberAvatars } from "@/components/shared-list/member-avatars";
import { AppSymbolIcon } from "@/components/symbol";
import { ThemedText } from "@/components/ui/themed-text";
import { t } from "@/lib/i18n";
import {
  alsoAddLists,
  partnerName,
  useAlsoAddTo,
  useSharedLists,
  withLine,
} from "@/lib/shared-lists";
import type { Id } from "@convex/_generated/dataModel";
import { Pressable, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

export function AlsoAddTo({
  itemId,
  city,
  count,
}: {
  itemId: Id<"items">;
  city: string;
  count: number;
}) {
  const { theme } = useUnistyles();
  const lists = alsoAddLists(useSharedLists().data);
  const { state, toggle } = useAlsoAddTo(itemId, city);
  if (lists.length === 0) return null;
  return (
    <View style={styles.section}>
      <ThemedText variant="captionStrong" style={styles.label}>
        {t("sharedLists.alsoAddTo")}
      </ThemedText>
      {lists.map((list) => {
        const status = state[list._id] ?? "off";
        const on = status === "on" || status === "removing";
        const busy = status === "adding" || status === "removing";
        const line =
          on && list.members.length > 1
            ? t("sharedLists.willSee", {
                name: partnerName(list.members),
                count,
              })
            : withLine(list.members);
        return (
          <Pressable
            key={list._id}
            accessibilityRole="checkbox"
            accessibilityLabel={`${list.name}, ${line}`}
            accessibilityState={{ checked: on, busy, disabled: busy }}
            disabled={busy}
            onPress={() => void toggle(list._id)}
            style={({ pressed }) => [
              styles.row,
              on && styles.on,
              pressed && styles.pressed,
            ]}
          >
            <MemberAvatars members={list.members} size={28} />
            <View style={styles.text}>
              <ThemedText variant="subheadStrong" numberOfLines={1}>
                {list.name}
              </ThemedText>
              <ThemedText
                variant="footnote"
                style={styles.muted}
                numberOfLines={1}
              >
                {line}
              </ThemedText>
            </View>
            <View style={[styles.check, on && styles.checkOn]}>
              {on ? (
                <AppSymbolIcon
                  name="checkmark"
                  size={14}
                  weight="bold"
                  tintColor={theme.colors.surface}
                />
              ) : null}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  section: { gap: theme.gap(1), paddingTop: theme.gap(2) },
  label: {
    color: theme.colors.muted,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  row: {
    minHeight: theme.control.minHeight,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.gap(1.5),
    paddingVertical: theme.gap(1.25),
    paddingHorizontal: theme.gap(1.5),
    borderRadius: theme.radius.lg,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  on: {
    borderColor: theme.colors.primarySoft,
    backgroundColor: theme.colors.primarySoft,
  },
  text: { flex: 1, gap: theme.gap(0.25) },
  muted: { color: theme.colors.muted },
  check: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  checkOn: {
    borderColor: theme.colors.foreground,
    backgroundColor: theme.colors.foreground,
  },
  pressed: { opacity: theme.opacity.pressed },
}));
