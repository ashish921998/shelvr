import { withAlpha } from "@/lib/color";
import type { ReactNode } from "react";
import { View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

export const PHONE_CUT = 40;
const FADE_HEIGHT = 72;
const PHONE_WIDTH = 236;
const BEZEL = 9;
const PHONE_RADIUS = 46;
const ISLAND_WIDTH = 64;
const STAGE_MIN_HEIGHT = 220;

export function PhoneFrame({
  children,
  overlay,
}: {
  children: ReactNode;
  overlay?: ReactNode;
}) {
  const { theme } = useUnistyles();
  return (
    <View
      style={styles.stage}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <View style={styles.bezel}>
        <View style={styles.screen}>
          {children}
          <View pointerEvents="none" style={styles.island} />
        </View>
      </View>
      <View
        pointerEvents="none"
        style={[
          styles.fade,
          {
            // Inline: Unistyles drops a stylesheet's experimental_backgroundImage
            // on theme change (jpudysz/react-native-unistyles#1030).
            experimental_backgroundImage: `linear-gradient(180deg, ${withAlpha(
              theme.colors.background,
              0,
            )} 0%, ${theme.colors.background} 100%)`,
          },
        ]}
      />
      {overlay}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  stage: {
    flex: 1,
    minHeight: STAGE_MIN_HEIGHT,
    alignItems: "center",
    overflow: "hidden",
  },
  bezel: {
    flex: 1,
    width: PHONE_WIDTH,
    maxWidth: "82%",
    marginBottom: -PHONE_CUT,
    padding: BEZEL,
    borderRadius: PHONE_RADIUS,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: theme.colors.imageBorder,
    backgroundColor: theme.colors.bezel,
  },
  screen: {
    flex: 1,
    borderRadius: PHONE_RADIUS - BEZEL,
    borderCurve: "continuous",
    overflow: "hidden",
    backgroundColor: theme.colors.background,
  },
  island: {
    position: "absolute",
    top: theme.gap(1),
    left: "50%",
    marginLeft: -ISLAND_WIDTH / 2,
    width: ISLAND_WIDTH,
    height: 18,
    borderRadius: 9,
    backgroundColor: theme.colors.bezel,
  },
  fade: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: FADE_HEIGHT,
  },
}));
