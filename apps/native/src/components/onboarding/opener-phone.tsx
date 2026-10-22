import { withAlpha } from "@/lib/color";
import type { ReactNode } from "react";
import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

// A phone drawn in the app, for the opener's pages. Its lower edge runs past
// the bottom of the stage and fades into the background, so it reads as a
// device without the page spending height on a chin.

/** How far the phone runs past the bottom of its stage. Screens that put
 * content near the bottom keep it this much higher. */
export const PHONE_CUT = 40;
// Short enough that content a screen keeps PHONE_CUT + gap(6) above its
// bottom edge stays legible, long enough to read as a fade and not a crop.
const FADE_HEIGHT = 72;
const PHONE_WIDTH = 236;
const BEZEL = 9;
const PHONE_RADIUS = 46;
const ISLAND_WIDTH = 64;
// The stage never shrinks below this; the page scrolls instead.
const STAGE_MIN_HEIGHT = 220;

/** The phone, decorative only. `overlay` draws on the stage, over the
 * phone's edge rather than inside its screen. */
export function PhoneFrame({
  children,
  overlay,
}: {
  children: ReactNode;
  overlay?: ReactNode;
}) {
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
      <View pointerEvents="none" style={styles.fade} />
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
    experimental_backgroundImage: `linear-gradient(180deg, ${withAlpha(
      theme.colors.background,
      0,
    )} 0%, ${theme.colors.background} 100%)`,
  },
}));
