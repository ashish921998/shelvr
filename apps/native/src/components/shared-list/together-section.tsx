import { SharedListCard } from "@/components/shared-list/list-card";
import { ThemedText } from "@/components/ui/themed-text";
import { t, useAppLocale } from "@/lib/i18n";
import { useSharedLists } from "@/lib/shared-lists";
import { useRouter } from "expo-router";
import { ActivityIndicator, Pressable, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

function NewListLink({ label }: { label: string }) {
  const router = useRouter();
  return (
    <Pressable
      testID="plans-new-list"
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      onPress={() => router.push("/new-shared-list")}
      style={({ pressed }) => pressed && styles.pressed}
    >
      <ThemedText variant="subheadLabel" style={styles.link}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

export function TogetherSection({
  showTripsHeading,
}: {
  showTripsHeading: boolean;
}) {
  useAppLocale();
  const lists = useSharedLists();
  const loading = lists.data === undefined && !lists.isError;
  const rows = lists.data ?? [];
  return (
    <View style={styles.container} testID="plans-together">
      <View style={styles.headingRow}>
        <View style={styles.headingText}>
          <ThemedText variant="title" accessibilityRole="header">
            {t("sharedLists.title")}
          </ThemedText>
          <ThemedText variant="footnote" style={styles.muted}>
            {t("sharedLists.hint")}
          </ThemedText>
        </View>
        {loading ? (
          <ActivityIndicator testID="plans-together-loading" />
        ) : (
          <NewListLink
            label={
              rows.length > 0 ? t("plans.newList") : t("sharedLists.start")
            }
          />
        )}
      </View>
      {rows.map((list) => (
        <SharedListCard key={list._id} list={list} />
      ))}
      {showTripsHeading ? (
        <ThemedText
          variant="title"
          accessibilityRole="header"
          style={styles.tripsHeading}
        >
          {t("plans.trips")}
        </ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: { gap: theme.gap(1.5) },
  headingRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: theme.gap(1),
  },
  headingText: { flex: 1, gap: theme.gap(0.25) },
  muted: { color: theme.colors.muted },
  link: { color: theme.colors.primaryText },
  pressed: { opacity: theme.opacity.pressed },
  tripsHeading: { marginTop: theme.gap(1.5) },
}));
