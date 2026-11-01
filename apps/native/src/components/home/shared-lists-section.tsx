import {
  SharedListCard,
  StartListRow,
} from "@/components/shared-list/list-card";
import { ThemedText } from "@/components/ui/themed-text";
import { t, useAppLocale } from "@/lib/i18n";
import { useSharedLists } from "@/lib/shared-lists";
import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

export function SharedListsSection() {
  useAppLocale();
  const lists = useSharedLists();
  if (lists.data === undefined) return null;
  if (lists.data.length === 0) {
    return (
      <View style={styles.quiet}>
        <StartListRow />
      </View>
    );
  }
  return (
    <View style={styles.container}>
      <View style={styles.heading}>
        <ThemedText variant="title">{t("sharedLists.title")}</ThemedText>
        <ThemedText variant="footnote" style={styles.muted}>
          {t("sharedLists.hint")}
        </ThemedText>
      </View>
      {lists.data.map((list) => (
        <SharedListCard key={list._id} list={list} />
      ))}
      <StartListRow />
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    gap: theme.gap(1.5),
    paddingHorizontal: theme.gap(2),
    paddingBottom: theme.gap(2),
  },
  quiet: { paddingHorizontal: theme.gap(2) },
  heading: { gap: theme.gap(0.25) },
  muted: { color: theme.colors.muted },
}));
