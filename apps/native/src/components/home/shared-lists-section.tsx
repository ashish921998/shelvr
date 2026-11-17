import { HomeSectionHeading } from "@/components/home/home-section-heading";
import { SharedListCard } from "@/components/shared-list/list-card";
import { t, useAppLocale } from "@/lib/i18n";
import { useSharedLists } from "@/lib/shared-lists";
import { useRouter } from "expo-router";
import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

export function SharedListsSection() {
  useAppLocale();
  const router = useRouter();
  const { data: lists = [] } = useSharedLists();
  const preview = lists.find((list) => list.newFrom?.length) ?? lists[0];
  if (!preview) return null;
  return (
    <View style={styles.container}>
      <HomeSectionHeading
        title={t("sharedLists.title")}
        action={
          lists.length > 1
            ? {
                label: t("homePlaces.seeAll"),
                onPress: () => router.push("/shared-lists"),
              }
            : undefined
        }
      />
      <SharedListCard list={preview} compact />
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    gap: theme.gap(1),
    paddingTop: theme.gap(1),
    paddingHorizontal: theme.gap(2),
    paddingBottom: theme.gap(2),
  },
}));
