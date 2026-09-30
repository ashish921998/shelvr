import { useAppHeaderHeight } from "@/lib/header-layout";
import { withAlpha } from "@/lib/tab-bar-motion";
import { View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

// How far past the header's bottom edge the fade keeps going.
const FADE_TAIL = 24;

/**
 * The fade's colour stops, from the top of the screen down. Solid behind the
 * status bar, then eased so there is no visible band where it ends.
 */
export function headerFadeStops(background: string): string[] {
  return [
    `${background} 0%`,
    `${background} 40%`,
    `${withAlpha(background, 0.85)} 62%`,
    `${withAlpha(background, 0.45)} 82%`,
    `${withAlpha(background, 0.12)} 94%`,
    `${withAlpha(background, 0)} 100%`,
  ];
}

/**
 * A page-coloured linear fade pinned behind the transparent iOS header, so the
 * feed disappears fully under the status bar and wordmark and clears just
 * below the header. The iOS 26 soft scroll edge alone only blurs and lightly
 * washes content, which leaves photos visible behind the title.
 *
 * Render it as a sibling AFTER the scrolling content, so the scroll view stays
 * the screen's first descendant (the native scroll edge effect relies on
 * that). Android's header is opaque, so there is nothing to fade there.
 */
export function HeaderFade() {
  const headerHeight = useAppHeaderHeight();
  // Read in JS, not in StyleSheet.create: Unistyles doesn't re-apply
  // `experimental_backgroundImage` on a live theme change.
  const { theme } = useUnistyles();

  if (process.env.EXPO_OS !== "ios") return null;

  const stops = headerFadeStops(theme.colors.background);
  return (
    <View
      pointerEvents="none"
      style={[
        styles.fade,
        {
          height: headerHeight + FADE_TAIL,
          experimental_backgroundImage: `linear-gradient(to bottom, ${stops.join(", ")})`,
        },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  fade: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
  },
});
