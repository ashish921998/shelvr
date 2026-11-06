import {
  SaveListRow,
  type SaveListItem,
} from "@/components/home/save-list-row";
import { SectionHeading } from "@/components/home/section-heading";
import { ThemedText } from "@/components/ui/themed-text";
import { t, useAppLocale } from "@/lib/i18n";
import { readingFirstDays } from "@/lib/save-list";
import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

const MAX_RECENT = 8;

export function RecentSaves({ saves }: { saves: SaveListItem[] }) {
  useAppLocale();
  const recent = saves
    .filter(
      (save) =>
        save.status === "processing" ||
        (save.status === "ready" && (save.cities ?? []).length > 0),
    )
    .slice(0, MAX_RECENT);
  if (recent.length === 0) return null;
  return (
    <View style={styles.container}>
      <View style={styles.heading}>
        <SectionHeading>{t("homePlaces.recents")}</SectionHeading>
      </View>
      {readingFirstDays(recent).map((day, index) => (
        <View key={day.key}>
          <ThemedText
            variant="finePrint"
            accessibilityRole="header"
            style={[styles.day, index > 0 && styles.laterDay]}
          >
            {day.title}
          </ThemedText>
          {day.saves.map((save) => (
            <SaveListRow key={save._id} save={save} />
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: { paddingHorizontal: theme.gap(2.5), paddingTop: 27 },
  heading: { paddingBottom: 8.5 },
  day: { lineHeight: 14, color: theme.colors.muted, marginBottom: 9.5 },
  laterDay: { marginTop: theme.gap(0.5) },
}));
