// The save-type mark: note, recipe, article, photo, video, product. It is the
// sticker pinned at a card's top-left corner and the icon beside a shelf name
// in a picker. Ink by default; a recipe is terracotta, a photo or video slate.

import { useMemo } from "react";
import { View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { useDerivedValue, type SharedValue } from "react-native-reanimated";
import { InkCanvas, InkFill, InkStrokes } from "@/components/ink/ink-canvas";
import { ease, span } from "@/lib/ink/geometry";
import { markFill, markStrokes, type MarkKind } from "@/lib/ink/strokes";
import { useInkClock } from "@/lib/ink/use-ink-clock";

/** The sticker disc a mark sits on when it is pinned to a card. */
export const STICKER_SIZE = 26;

/** Marks carry the type word for screen readers; the drawing itself is
 * hidden, like all ink. */
const MARK_LABEL: Record<MarkKind, string> = {
  note: "Note",
  recipe: "Recipe",
  article: "Article",
  photo: "Photo",
  product: "Product",
  video: "Video",
  camera: "Photo",
};

function markColor(
  kind: MarkKind,
  theme: {
    colors: { foreground: string; ink: { terracotta: string; slate: string } };
  },
) {
  if (kind === "recipe") return theme.colors.ink.terracotta;
  if (kind === "photo" || kind === "video") return theme.colors.ink.slate;
  return theme.colors.foreground;
}

/** The drawing on its own, with no disc. Use this inside a list row or a chip. */
export function TypeMark({
  kind,
  size = 18,
  clock,
  seed = 0,
  tint,
}: {
  kind: MarkKind;
  size?: number;
  clock?: SharedValue<number>;
  seed?: number;
  tint?: string;
}) {
  const { theme } = useUnistyles();
  const own = useInkClock();
  const t = clock ?? own;
  // A mark starts after its card has landed.
  const from = 0.9 + (seed % 6) * 0.1;
  const progress = useDerivedValue(
    () => ease(span(t.value, from, from + 0.4)),
    [t, from],
  );
  const strokes = useMemo(
    () => markStrokes(kind, size * 0.3, seed * 3),
    [kind, size, seed],
  );
  const fill = useMemo(() => markFill(kind, size * 0.3), [kind, size]);
  const color = tint ?? markColor(kind, theme);

  return (
    <InkCanvas width={size} height={size}>
      <InkStrokes
        strokes={strokes}
        progress={progress}
        color={color}
        width={1.05}
        originX={size / 2}
        originY={size / 2}
      />
      {fill ? (
        <InkFill
          points={fill}
          color={color}
          originX={size / 2}
          originY={size / 2}
        />
      ) : null}
    </InkCanvas>
  );
}

/**
 * The mark as a sticker: a 26px surface disc with a 1px border and a small
 * shadow, pinned at (-8, -8) of a card so it overhangs the corner.
 */
export function TypeMarkSticker({
  kind,
  clock,
  seed = 0,
  size = STICKER_SIZE,
}: {
  kind: MarkKind;
  clock?: SharedValue<number>;
  seed?: number;
  size?: number;
}) {
  return (
    <View
      style={[
        styles.sticker,
        { width: size, height: size, borderRadius: size / 2 },
      ]}
      accessibilityRole="image"
      accessibilityLabel={MARK_LABEL[kind]}
    >
      <TypeMark kind={kind} size={size * 0.7} clock={clock} seed={seed} />
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  sticker: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
}));
