// Every icon in the app, drawn rather than set from a symbol font. Swapping a
// call site is a one-line change: `<AppSymbolIcon name size tintColor />`
// becomes `<InkIcon name size tint />`.
//
// The one exception is `SuggestedBadge`, which keeps the filled amber sparkle
// so "suggested" reads as a different kind of thing from a drawn mark.

import { useMemo } from "react";
import { useUnistyles } from "react-native-unistyles";
import { useDerivedValue, type SharedValue } from "react-native-reanimated";
import { InkCanvas, InkStrokes } from "@/components/ink/ink-canvas";
import { ease, span } from "@/lib/ink/geometry";
import {
  iconStrokes,
  iconStrokeWidth,
  type InkIconName,
} from "@/lib/ink/icons";
import { useInkClock } from "@/lib/ink/use-ink-clock";

/** Sizes from the spec: nav 22, header buttons 18, inline 14–16. */
export function InkIcon({
  name,
  size = 18,
  tint,
  seed = 0,
  clock,
  opacity = 0.95,
}: {
  name: InkIconName;
  size?: number;
  tint?: string;
  seed?: number;
  /** Share the screen's clock so an icon draws in step with the rest of the
   * ink. Omitted, the icon runs its own entry. */
  clock?: SharedValue<number>;
  opacity?: number | SharedValue<number>;
}) {
  const { theme } = useUnistyles();
  const own = useInkClock(1);
  const t = clock ?? own;
  // The icon set is drawn in over 450ms on mount, staggered a little so a row
  // of icons reads as one hand moving rather than a simultaneous flash.
  const progress = useDerivedValue(
    () =>
      ease(span(t.value, 0.15 + (seed % 6) * 0.06, 0.6 + (seed % 6) * 0.06)),
    [t, seed],
  );
  const strokes = useMemo(
    () => iconStrokes(name, size, seed),
    [name, size, seed],
  );

  return (
    <InkCanvas width={size} height={size}>
      <InkStrokes
        strokes={strokes}
        progress={progress}
        color={tint ?? theme.colors.foreground}
        width={iconStrokeWidth(size)}
        opacity={opacity}
        originX={size / 2}
        originY={size / 2}
      />
    </InkCanvas>
  );
}
