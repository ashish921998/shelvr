import { useWindowDimensions } from "react-native";

// Step headlines are already display size. Like iOS's own titles they grow
// less than body text at the largest sizes, so the content under them stays
// on screen.
export const HEADLINE_MAX_SCALE = 2;

// Text scale above which steps switch to a roomier layout. iOS's accessibility
// sizes start a little above 1.4. Android reports the same scale for its
// larger display font settings, so the roomier layout applies there too.
export const LARGE_TEXT_SCALE = 1.4;

/** True when the user's text size is large enough to need the roomier layout. */
export function useLargeText(): boolean {
  return useWindowDimensions().fontScale > LARGE_TEXT_SCALE;
}
