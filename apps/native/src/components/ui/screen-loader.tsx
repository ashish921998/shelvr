import { t, useAppLocale } from "@/lib/i18n";
import { View, Text, useWindowDimensions } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { InkShelf } from "@/components/ink/ink-shelf";
import { ThreadLoop } from "@/components/ink/ink-thread";
import { INK_A11Y } from "@/components/ink/ink-canvas";

// Loading is drawn, not spun: an ochre thread runs a figure-eight over an
// empty shelf while the shelves are being set. Nothing in the app spins.

const THREAD_HEIGHT = 84;

export function ScreenLoader({
  label = t("common.loading"),
}: {
  label?: string;
}) {
  useAppLocale();
  const { width } = useWindowDimensions();
  const shelfWidth = Math.min(width - 80, 240);

  return (
    <View
      style={styles.container}
      accessibilityRole="progressbar"
      accessibilityLabel={label}
    >
      <View style={styles.drawing} {...INK_A11Y}>
        <ThreadLoop width={shelfWidth} height={THREAD_HEIGHT} />
        <InkShelf width={shelfWidth} style={styles.shelf} />
      </View>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    backgroundColor: theme.colors.background,
  },
  drawing: { alignItems: "center" },
  shelf: { marginTop: -10 },
  label: {
    fontFamily: theme.fonts.display,
    fontSize: 28,
    color: theme.colors.foreground,
  },
}));
