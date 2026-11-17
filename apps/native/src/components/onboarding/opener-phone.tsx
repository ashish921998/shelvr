import { withAlpha } from "@/lib/color";
import type { ReactNode } from "react";
import { View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

const PHONE_CUT = 40;
const FADE_HEIGHT = 72;
const PHONE_WIDTH = 236;
const BEZEL = 9;
const PHONE_RADIUS = 46;
const ISLAND_WIDTH = 64;
const STAGE_MIN_HEIGHT = 220;
export const FULL_PHONE_HEIGHT = 490;
export const FULL_PHONE_WIDTH = PHONE_WIDTH;

export function PhoneFrame({
  children,
  full = false,
}: {
  children: ReactNode;
  full?: boolean;
}) {
  const { theme } = useUnistyles();
  return (
    <View
      style={[styles.stage, full && styles.fullStage]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <View style={[styles.bezel, full && styles.fullBezel]}>
        <View style={styles.screen}>
          {children}
          {full ? null : <View pointerEvents="none" style={styles.island} />}
        </View>
      </View>
      {full ? null : (
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
      )}
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
  fullStage: {
    flex: 0,
    width: FULL_PHONE_WIDTH,
    height: FULL_PHONE_HEIGHT,
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
  fullBezel: {
    maxWidth: "100%",
    marginBottom: 0,
    padding: 4,
    borderRadius: theme.gap(5),
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
