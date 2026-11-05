import { SaveRow } from "@/components/city/save-row";
import { ScreenLoader } from "@/components/ui/screen-loader";
import { ThemedText } from "@/components/ui/themed-text";
import { useHomeFeed } from "@/lib/home-feed";
import { t, useAppLocale } from "@/lib/i18n";
import { saveDays, saveDetail } from "@/lib/save-list";
import { useRouter } from "expo-router";
import { SectionList } from "react-native";
import { StyleSheet } from "react-native-unistyles";

export function AllSaves() {
  useAppLocale();
  const router = useRouter();
  const { items, loadMore } = useHomeFeed();
  if (items === undefined) return <ScreenLoader label={t("loading.home")} />;
  return (
    <SectionList
      style={styles.screen}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.content}
      sections={saveDays(items).map((day) => ({ ...day, data: day.saves }))}
      keyExtractor={(save) => save._id}
      stickySectionHeadersEnabled={false}
      ListHeaderComponent={
        <ThemedText
          variant="displayTitle"
          accessibilityRole="header"
          style={styles.title}
        >
          {t("homePlaces.allSaves")}
        </ThemedText>
      }
      renderSectionHeader={({ section }) => (
        <ThemedText
          variant="labelStrong"
          accessibilityRole="header"
          style={styles.day}
        >
          {section.title}
        </ThemedText>
      )}
      renderItem={({ item: save }) => (
        <SaveRow
          item={save}
          detail={saveDetail(save)}
          onPress={() =>
            router.push({
              pathname: "/item/[id]",
              params: { id: save._id, from: "home" },
            })
          }
        />
      )}
      onEndReached={loadMore}
      onEndReachedThreshold={0.5}
    />
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  screen: { flex: 1, backgroundColor: theme.colors.background },
  content: {
    paddingHorizontal: theme.gap(2),
    paddingBottom: rt.insets.bottom + theme.gap(4),
  },
  title: { color: theme.colors.foreground, paddingBottom: theme.gap(0.5) },
  day: {
    color: theme.colors.muted,
    paddingTop: theme.gap(2),
    paddingBottom: theme.gap(0.25),
  },
}));
