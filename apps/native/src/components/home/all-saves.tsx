import { ScreenTitle } from "@/components/screen-title";
import { HomePlacesEmptyCard } from "@/components/home/home-places";
import { SaveListRow } from "@/components/home/save-list-row";
import { ScreenLoader } from "@/components/ui/screen-loader";
import { ThemedText } from "@/components/ui/themed-text";
import { useHomeFeed } from "@/lib/home-feed";
import { t, useAppLocale } from "@/lib/i18n";
import { readingFirstDays } from "@/lib/save-list";
import { SectionList, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

export function AllSaves() {
  useAppLocale();
  const { items, loadMore } = useHomeFeed();
  if (items === undefined) return <ScreenLoader label={t("loading.home")} />;
  const sections = readingFirstDays(items).map((day) => ({
    ...day,
    data: day.saves,
  }));
  return (
    <View style={styles.screen}>
      <ScreenTitle title={t("homePlaces.allSaves")} />
      <SectionList
        style={styles.list}
        contentContainerStyle={styles.content}
        sections={sections}
        keyExtractor={(save) => save._id}
        stickySectionHeadersEnabled={false}
        ListEmptyComponent={
          <View style={styles.empty}>
            <HomePlacesEmptyCard />
          </View>
        }
        renderSectionHeader={({ section }) => (
          <ThemedText
            variant="finePrint"
            accessibilityRole="header"
            style={[
              styles.day,
              section.key !== sections[0]?.key && styles.laterDay,
            ]}
          >
            {section.title}
          </ThemedText>
        )}
        renderItem={({ item: save }) => <SaveListRow save={save} />}
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
      />
    </View>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  screen: { flex: 1, backgroundColor: theme.colors.background },
  list: { flex: 1 },
  content: {
    paddingHorizontal: theme.gap(2.5),
    paddingBottom: rt.insets.bottom + theme.gap(4),
  },
  empty: { paddingTop: theme.gap(1) },
  day: { lineHeight: 14, color: theme.colors.muted, marginBottom: 9.5 },
  laterDay: { marginTop: theme.gap(0.5) },
}));
