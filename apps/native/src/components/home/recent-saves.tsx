import { SaveRow } from "@/components/city/save-row";
import { ThemedText } from "@/components/ui/themed-text";
import { t, useAppLocale } from "@/lib/i18n";
import { saveDays, saveDetail } from "@/lib/save-list";
import type { Id } from "@convex/_generated/dataModel";
import { useRouter } from "expo-router";
import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

const MAX_RECENT = 8;

type RecentSave = {
  _id: Id<"items">;
  _creationTime: number;
  status: "processing" | "ready" | "failed";
  cities?: string[];
  tags: string[];
  title?: string;
  url?: string;
  imageUrl: string | null;
  heroImageUrl?: string;
  author?: string;
  siteName?: string;
};

export function RecentSaves({ saves }: { saves: RecentSave[] }) {
  useAppLocale();
  const router = useRouter();
  const recent = saves
    .filter((save) => save.status === "ready" && (save.cities ?? []).length > 0)
    .slice(0, MAX_RECENT);
  if (recent.length === 0) return null;
  return (
    <View style={styles.container}>
      <ThemedText variant="title" accessibilityRole="header">
        {t("homePlaces.recentSaves")}
      </ThemedText>
      {saveDays(recent).map((day) => (
        <View key={day.key}>
          <ThemedText
            variant="labelStrong"
            accessibilityRole="header"
            style={styles.day}
          >
            {day.title}
          </ThemedText>
          {day.saves.map((save) => (
            <SaveRow
              key={save._id}
              item={save}
              detail={saveDetail(save)}
              onPress={() =>
                router.push({
                  pathname: "/item/[id]",
                  params: { id: save._id, from: "home" },
                })
              }
            />
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    gap: theme.gap(1),
    paddingHorizontal: theme.gap(2),
    paddingTop: theme.gap(3),
  },
  day: { color: theme.colors.muted, paddingBottom: theme.gap(0.25) },
}));
