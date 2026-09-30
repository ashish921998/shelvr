import { useAppHeaderHeight } from "@/lib/header-layout";
import { withAlpha } from "@/lib/color";
import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

// How far past the header's bottom edge the fade keeps going.
const FADE_TAIL = 24;

/**
 * A page-colored fade behind the transparent iOS header: solid under the
 * status bar, eased out just past the header. Pair it with the stack's
 * `softScrollEdge` chrome (`scrollEdgeEffects: { top: "soft" }`). On iOS 26
 * that native edge only washes content lightly, so photos would stay visible
 * behind the title; below iOS 26 this fade does the job alone. Android renders
 * nothing: its header is an opaque bar.
 *
 * Render it as a sibling AFTER the scrolling content, so the scroll view stays
 * the screen's first descendant, which the native edge effect looks for.
 */
export function HeaderScrim() {
  const headerHeight = useAppHeaderHeight();
  if (process.env.EXPO_OS !== "ios") return null;
  return (
    <View
      pointerEvents="none"
      style={[styles.scrim, { height: headerHeight + FADE_TAIL }]}
    />
  );
}

const styles = StyleSheet.create((theme) => {
  const bg = theme.colors.background;
  // Eased so the fade has no visible band where it ends.
  const stops = [
    `${bg} 0%`,
    `${bg} 40%`,
    `${withAlpha(bg, 0.85)} 62%`,
    `${withAlpha(bg, 0.45)} 82%`,
    `${withAlpha(bg, 0.12)} 94%`,
    `${withAlpha(bg, 0)} 100%`,
  ];
  return {
    scrim: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      experimental_backgroundImage: `linear-gradient(180deg, ${stops.join(", ")})`,
    },
  };
});
