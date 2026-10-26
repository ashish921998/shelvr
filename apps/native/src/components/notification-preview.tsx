import { t, useAppLocale } from "@/lib/i18n";
import { Image } from "expo-image";
import { Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { withAlpha } from "@/lib/color";

const APP_ICON = require("../../assets/icon.png");

/** `frosted` sits it over a photo on a near-opaque surface, as iOS draws a banner over content. */
export function NotificationPreview({
  body,
  title,
  when,
  frosted = false,
}: {
  body: string;
  title?: string;
  when?: string;
  frosted?: boolean;
}) {
  useAppLocale();
  return (
    <View style={[styles.push, frosted && styles.frosted]} accessible>
      <Image source={APP_ICON} style={styles.icon} />
      <View style={styles.text}>
        <View style={styles.top}>
          <Text style={styles.app}>Shelvr</Text>
          <Text style={styles.when}>{when ?? t("weekly.previewTime")}</Text>
        </View>
        <Text style={styles.title}>{title ?? t("weekly.previewTitle")}</Text>
        <Text style={styles.body} numberOfLines={2}>
          {body}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  push: {
    flexDirection: "row",
    gap: theme.gap(1.25),
    padding: theme.gap(1.5),
    borderRadius: theme.radius.md,
    borderCurve: "continuous",
    backgroundColor: theme.colors.surfaceMuted,
  },
  frosted: {
    backgroundColor: withAlpha(theme.colors.surface, 0.94),
  },
  icon: {
    width: 32,
    height: 32,
    borderRadius: theme.radius.sm,
    borderCurve: "continuous",
  },
  text: {
    flex: 1,
    gap: 1,
  },
  top: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    gap: theme.gap(1),
  },
  app: {
    fontFamily: theme.fonts.bold,
    fontSize: 12,
    letterSpacing: 0.4,
    textTransform: "uppercase",
    color: theme.colors.muted,
  },
  when: {
    fontFamily: theme.fonts.regular,
    fontSize: 12,
    color: theme.colors.faint,
  },
  title: {
    fontFamily: theme.fonts.bold,
    fontSize: 14,
    color: theme.colors.foreground,
  },
  body: {
    fontFamily: theme.fonts.regular,
    fontSize: 14,
    lineHeight: 19,
    color: theme.colors.foreground,
  },
}));
