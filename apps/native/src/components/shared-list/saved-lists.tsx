import { SharedListCard } from "@/components/shared-list/list-card";
import { ThemedText } from "@/components/ui/themed-text";
import { t, useAppLocale } from "@/lib/i18n";
import { useSharedLists } from "@/lib/shared-lists";
import { useRouter } from "expo-router";
import { ActivityIndicator, Pressable, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

function ListAction({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.action, pressed && styles.pressed]}
    >
      <ThemedText variant="subheadLabel" style={styles.link}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

export function SavedLists() {
  useAppLocale();
  const router = useRouter();
  const { data: lists, isError, refetch } = useSharedLists();
  const createList = () => router.push("/new-shared-list");

  if (lists === undefined) {
    return (
      <View style={styles.content}>
        {isError ? (
          <>
            <ThemedText variant="footnote" style={styles.hint}>
              {t("errors.connection")}
            </ThemedText>
            <ListAction
              label={t("common.retry")}
              onPress={() => void refetch()}
            />
          </>
        ) : (
          <ActivityIndicator accessibilityLabel={t("common.loading")} />
        )}
      </View>
    );
  }

  return (
    <View style={styles.content}>
      {lists.length === 0 ? (
        <ThemedText variant="footnote" style={styles.hint}>
          {t("sharedLists.hint")}
        </ThemedText>
      ) : null}
      <ListAction
        label={t(lists.length > 0 ? "plans.newList" : "sharedLists.start")}
        onPress={createList}
      />
      {lists.map((list) => (
        <SharedListCard key={list._id} list={list} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  content: { gap: theme.gap(1), paddingHorizontal: theme.gap(2) },
  action: {
    alignSelf: "flex-start",
    justifyContent: "center",
    minHeight: theme.control.minHeight,
  },
  hint: { color: theme.colors.muted },
  link: { color: theme.colors.primaryText },
  pressed: { opacity: theme.opacity.pressed },
}));
