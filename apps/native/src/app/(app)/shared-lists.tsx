import { SharedListCard } from "@/components/shared-list/list-card";
import { Button } from "@/components/ui/button";
import { ScreenLoader } from "@/components/ui/screen-loader";
import { ThemedText } from "@/components/ui/themed-text";
import { t, useAppLocale } from "@/lib/i18n";
import { useSharedLists } from "@/lib/shared-lists";
import { FlatList } from "react-native";
import { StyleSheet } from "react-native-unistyles";

export default function SharedListsScreen() {
  useAppLocale();
  const { data: lists, isError, refetch } = useSharedLists();
  if (!lists && !isError) return <ScreenLoader />;
  return (
    <FlatList
      data={lists}
      keyExtractor={(list) => list._id}
      renderItem={({ item }) => <SharedListCard list={item} compact />}
      ListEmptyComponent={
        isError ? (
          <Button title={t("common.retry")} onPress={() => void refetch()} />
        ) : (
          <ThemedText variant="body">{t("sharedLists.emptyTitle")}</ThemedText>
        )
      }
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.content}
      style={styles.screen}
    />
  );
}

const styles = StyleSheet.create((theme) => ({
  screen: { backgroundColor: theme.colors.background },
  content: { padding: theme.gap(2), gap: theme.gap(1) },
}));
