import { AppSymbolIcon } from "@/components/symbol";
import { type City, cityCountLine } from "@/lib/home-places";
import { t } from "@/lib/i18n";
import { Image } from "expo-image";
import { Text, View } from "react-native";
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
  if (layout === "pair") {
    return (
      <View style={styles.card}>
        <View style={styles.art}>
          <CoverArt entry={entry} />
        </View>
        <View style={styles.text}>
          <Text style={styles.name} numberOfLines={1}>
            {entry.city}
          </Text>
          {count ? <Text style={styles.count}>{count}</Text> : null}
        </View>
      </View>
    );
  }
  return (
    <View style={[styles.card, styles.wide, layout === "only" && styles.only]}>
      <CoverArt entry={entry} />
      <View style={styles.caption}>
        <Text style={styles.name} numberOfLines={1}>
          {entry.city}
        </Text>
        {count ? <Text style={styles.count}>{count}</Text> : null}
        {layout === "only" ? (
          <Text style={styles.count}>
            {t("homePlaces.fromSaves", { count: entry.count })}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  card: {
    overflow: "hidden",
    borderRadius: theme.radius.lg,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  art: { height: 112, overflow: "hidden" },
  tint: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.primarySoft,
  },
  tintMuted: { backgroundColor: theme.colors.surfaceMuted },
  text: {
    gap: theme.gap(0.125),
    paddingHorizontal: theme.gap(1.5),
    paddingTop: theme.gap(1.25),
    paddingBottom: theme.gap(1.5),
  },
  wide: { minHeight: 140, justifyContent: "flex-end" },
  only: { minHeight: 200 },
  caption: {
    alignSelf: "flex-start",
    maxWidth: 220,
    margin: theme.gap(1.25),
    paddingVertical: theme.gap(1),
    paddingHorizontal: theme.gap(1.5),
    borderRadius: theme.radius.md,
    borderCurve: "continuous",
    backgroundColor: theme.colors.surface,
  },
  name: { ...theme.type.title, color: theme.colors.foreground },
  count: { ...theme.type.caption, color: theme.colors.muted },
}));
