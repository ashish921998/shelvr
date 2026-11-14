import { ThemedText } from "@/components/ui/themed-text";
import { useAppLocale } from "@/lib/i18n";
import { activityLine, useSharedLists } from "@/lib/shared-lists";
import { AppSymbolIcon } from "@/components/symbol";
import { useRouter } from "expo-router";
import { Pressable, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

export function SharedListsNudge() {
  useAppLocale();
  const router = useRouter();
  const { theme } = useUnistyles();
  const lists = useSharedLists();
  const fresh = (lists.data ?? []).find((list) => list.newFrom.length > 0);
  if (fresh === undefined) return null;
  const line = activityLine(fresh.newFrom);
  if (line === null) return null;
  return (
    <View style={styles.container}>
      <Pressable
        testID="home-shared-list-nudge"
        accessibilityRole="button"
        accessibilityLabel={`${line}, ${fresh.name}`}
        onPress={() =>
          router.push({
            pathname: "/shared-list/[id]",
            params: { id: fresh._id },
          })
        }
        style={({ pressed }) => [styles.nudge, pressed && styles.pressed]}
      >
        <View style={styles.text}>
          <ThemedText variant="subheadLabel" numberOfLines={1}>
            {line}
          </ThemedText>
          <ThemedText variant="footnote" style={styles.muted} numberOfLines={1}>
            {fresh.name}
          </ThemedText>
        </View>
        <AppSymbolIcon
          name="chevron.right"
          size={13}
          tintColor={theme.colors.muted}
        />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: { paddingHorizontal: theme.gap(2), paddingBottom: theme.gap(2) },
  nudge: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.gap(1),
    paddingVertical: theme.gap(1.25),
    paddingHorizontal: theme.gap(1.5),
    borderRadius: theme.radius.lg,
    borderCurve: "continuous",
    backgroundColor: theme.colors.primarySoft,
  },
  text: { flex: 1, gap: theme.gap(0.25) },
  muted: { color: theme.colors.muted },
  pressed: { opacity: theme.opacity.pressed },
}));
