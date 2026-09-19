// The header every screen wears: a 40-tall row of chrome with the ochre
// hairline drawn under it. The big Exposure headline is not in here — it lives
// in the content, so the bar stays the same height on every screen.

import { type ReactNode } from "react";
import { View, Text, useWindowDimensions } from "react-native";
import type { SharedValue } from "react-native-reanimated";
import { StyleSheet } from "react-native-unistyles";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Hairline } from "@/components/ink/hairline";

export function ScreenHeader({
  /** The screen's name, set in Exposure. Omitted, `center` is drawn instead
   * (Home carries the wordmark there). */
  title,
  center,
  left,
  right,
  /** Medium 12 muted, under the title: "Saved Monday · on Recipes". */
  subtitle,
  clock,
}: {
  title?: string;
  center?: ReactNode;
  left?: ReactNode;
  right?: ReactNode;
  subtitle?: string;
  clock?: SharedValue<number>;
}) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  return (
    <View style={[styles.wrap, { paddingTop: insets.top + 6 }]}>
      <View style={styles.row}>
        <View style={styles.side}>{left}</View>
        <View style={styles.centre}>
          {center ?? (
            <>
              <Text style={styles.title} numberOfLines={1}>
                {title}
              </Text>
              {subtitle ? (
                <Text style={styles.subtitle} numberOfLines={1}>
                  {subtitle}
                </Text>
              ) : null}
            </>
          )}
        </View>
        <View style={[styles.side, styles.sideRight]}>{right}</View>
      </View>
      <Hairline width={width} clock={clock} />
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  wrap: { paddingHorizontal: 0 },
  row: {
    height: 40,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
  },
  // Both sides reserve at least a button's width so a lone title stays
  // optically centred; Tidy puts two controls on the right and grows.
  side: {
    minWidth: 40,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
    gap: 6,
  },
  sideRight: { alignItems: "flex-end" },
  centre: { flex: 1, alignItems: "center", justifyContent: "center" },
  title: {
    fontFamily: theme.fonts.display,
    fontSize: 24,
    lineHeight: 28,
    color: theme.colors.foreground,
  },
  subtitle: {
    fontFamily: theme.fonts.medium,
    fontSize: 12,
    color: theme.colors.muted,
  },
}));
