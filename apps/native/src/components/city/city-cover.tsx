import { t } from "@/lib/i18n";
import { Image } from "expo-image";
import { Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

export function CityCover({
  city,
  count,
  cover,
  height,
}: {
  city: string;
  count: number;
  cover: string | null;
  height: number;
}) {
  const onPhoto = cover !== null;
  return (
    <View style={[styles.frame, { height }]}>
      {cover ? (
        <Image
          source={{ uri: cover }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
        />
      ) : null}
      <View style={[styles.caption, onPhoto && styles.scrim]}>
        <Text
          style={[styles.name, onPhoto && styles.onPhoto]}
          numberOfLines={2}
        >
          {city}
        </Text>
        <Text style={[styles.count, onPhoto && styles.onPhoto]}>
          {t("spaces.saveCount", { count })}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  frame: {
    justifyContent: "flex-end",
    overflow: "hidden",
    borderRadius: theme.radius.lg,
    borderCurve: "continuous",
    backgroundColor: theme.colors.surfaceMuted,
  },
  caption: {
    gap: theme.gap(0.25),
    padding: theme.gap(1.5),
  },
  scrim: { backgroundColor: theme.colors.overlay },
  name: { ...theme.type.title, color: theme.colors.foreground },
  count: { ...theme.type.footnote, color: theme.colors.muted },
  onPhoto: { color: theme.colors.onOverlay },
}));
