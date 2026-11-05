import { AppSymbolIcon } from "@/components/symbol";
import { ThemedText } from "@/components/ui/themed-text";
import { type City, cityCountLine } from "@/lib/home-places";
import { t } from "@/lib/i18n";
import { Image } from "expo-image";
import { View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

export type CoverLayout = "pair" | "wide" | "only";

function CoverArt({ entry }: { entry: City }) {
  const { theme } = useUnistyles();
  if (entry.cover) {
    return (
      <Image
        source={{ uri: entry.cover }}
        style={[StyleSheet.absoluteFill, styles.tintMuted]}
        contentFit="cover"
      />
    );
  }
  const pinless = entry.placeCount === 0;
  return (
    <View
      style={[
        StyleSheet.absoluteFill,
        styles.tint,
        pinless && styles.tintMuted,
      ]}
    >
      <AppSymbolIcon
        name="mappin"
        size={22}
        tintColor={pinless ? theme.colors.muted : theme.colors.primaryText}
      />
    </View>
  );
}

export function CityCover({
  entry,
  layout,
}: {
  entry: City;
  layout: CoverLayout;
}) {
  const count = cityCountLine(entry);
  return (
    <View style={styles.card}>
      <View
        style={[
          styles.art,
          layout === "wide" && styles.artWide,
          layout === "only" && styles.artOnly,
        ]}
      >
        <CoverArt entry={entry} />
      </View>
      <View style={styles.text}>
        <ThemedText variant="header" numberOfLines={1}>
          {entry.city}
        </ThemedText>
        {count ? (
          <ThemedText variant="caption" style={styles.count}>
            {count}
          </ThemedText>
        ) : null}
        {layout === "only" ? (
          <ThemedText variant="caption" style={styles.count}>
            {t("homePlaces.fromSaves", { count: entry.count })}
          </ThemedText>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  card: { gap: theme.gap(1) },
  art: {
    height: 180,
    overflow: "hidden",
    borderRadius: theme.radius.lg,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: theme.colors.imageBorder,
  },
  artWide: { height: 168 },
  artOnly: { height: 220 },
  tint: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.primarySoft,
  },
  tintMuted: { backgroundColor: theme.colors.surfaceMuted },
  text: { gap: theme.gap(0.125) },
  count: { color: theme.colors.muted },
}));
