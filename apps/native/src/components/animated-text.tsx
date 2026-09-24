import { motion } from "@/lib/motion";
import { needsNativeText } from "@/lib/text-shaping";
import {
  advanceMorphTransition,
  includeMorphExits,
  layoutMorphText,
  pruneMorphCells,
  reconcileMorphCells,
  resolveMorphRender,
  type MorphTransition,
} from "@/lib/text-morph";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import {
  Text as RNText,
  StyleSheet as RNStyleSheet,
  View,
  useWindowDimensions,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import {
  BlurMask,
  Canvas,
  Group,
  Text as SkiaText,
  useFont,
  type SkFont,
} from "@shopify/react-native-skia";
import {
  cancelAnimation,
  useDerivedValue,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

// A character-diffing text morph rendered through Skia so each glyph can
// carry a real Gaussian blur. When `text` changes, characters shared with the
// previous string persist (same key → same glyph) and glide to their new
// position, while removed characters animate out (up + right, shrink, blur,
// fade) and added characters animate in (rise from below, grow, sharpen,
// fade), staggered left to right. The scene is bounded by the slot width and
// MAX_MORPH_GLYPHS, interruption-aware, and pruned in one batch, so a long
// note or rapid paging cannot flood it with worklet nodes.

const FONTS: Record<string, number> = {
  "CrimsonProRoman-Regular": require("../../assets/fonts/CrimsonProRoman-Regular.ttf"),
  "Satoshi-Regular": require("../../assets/fonts/Satoshi-Regular.otf"),
  "Satoshi-Medium": require("../../assets/fonts/Satoshi-Medium.otf"),
  "Satoshi-Bold": require("../../assets/fonts/Satoshi-Bold.otf"),
};

const morph = motion.textMorph;
const CANVAS_HEIGHT = 56;
// Fixed layout width. Kept just under the native header's title slot (~242pt
// between the bar buttons) so it is never clamped — iOS then centers the whole
// canvas on screen and the text, centered within it, lands dead-center.
const DEFAULT_WIDTH = 240;
const DEFAULT_FONT_SIZE = 24;
// How long a slot may stay blank waiting for Skia to resolve its font, so the
// title can rise into an empty header instead of replacing text already on
// screen. About one screen transition, so the gap hides inside the push, and
// bounded so a slow or failed font load still shows the title. Timed from
// mount to resolve on an iOS simulator over Metro's fetch: 53ms for a
// session's first slot, 30ms warm. Losing the race costs a late title and a
// 2pt baseline step where the canvas replaces native text. The figures are
// simulator ones; a real device or Android still pays a typeface parse, so
// re-time it there before moving the hold.
const FONT_HOLD_MS = motion.duration.enter;

// How long a started transition stays active: the slowest of its staggered
// entrance and its delayed position glide. An interrupted transition drops the
// stagger, so it settles on the short feedback timing instead.
function morphDuration(glyphs: number, interrupted: boolean) {
  if (interrupted) return motion.timing.feedback.duration;
  return Math.max(
    morph.enterDelay +
      Math.max(0, glyphs - 1) * morph.stagger +
      morph.enter.duration,
    morph.glideDelay + morph.glide.duration,
  );
}

type CharGlyphProps = {
  char: string;
  x: number;
  glyphWidth: number;
  charIndex: number;
  isExiting: boolean;
  animateIn: boolean;
  interrupted: boolean;
  font: SkFont;
  color: string;
  fontSize: number;
  baselineY: number;
  blurMax: number;
};

// Primitive props let unchanged glyphs skip reconciliation work.
const CharGlyph = memo(function CharGlyph({
  char,
  x,
  glyphWidth,
  charIndex,
  isExiting,
  animateIn,
  interrupted,
  font,
  color,
  fontSize,
  baselineY,
  blurMax,
}: CharGlyphProps) {
  const gx = useSharedValue(x);
  const progress = useSharedValue(animateIn || isExiting ? 0 : 1);
  const fade = useSharedValue(animateIn || isExiting ? 0 : 1);
  const direction = useSharedValue(1);

  const isFirstLayout = useRef(true);
  useEffect(() => {
    if (isFirstLayout.current) {
      isFirstLayout.current = false;
      return;
    }
    cancelAnimation(gx);
    gx.set(
      interrupted
        ? withTiming(x, motion.timing.feedback)
        : withDelay(morph.glideDelay, withTiming(x, morph.glide)),
    );
    // Rapid paging unmounts glyphs mid-glide, and withDelay keeps its timer
    // running until the delay elapses. Stop it with the glyph.
    return () => {
      cancelAnimation(gx);
    };
  }, [x, interrupted, gx]);

  const firstAppearance = useRef(true);
  useEffect(() => {
    const staggerEntrance = firstAppearance.current && animateIn;
    firstAppearance.current = false;

    // withDelay keeps the PREVIOUS animation running during its delay. Stop
    // it explicitly, otherwise a returning letter continues fading to zero.
    cancelAnimation(progress);
    cancelAnimation(fade);

    if (!isExiting) {
      direction.set(1);
      // Reversals resume immediately from the current value. Only a newly
      // added letter receives the signature stagger.
      const delay = staggerEntrance
        ? morph.enterDelay + charIndex * morph.stagger
        : 0;
      progress.set(
        interrupted
          ? withTiming(1, motion.timing.feedback)
          : withDelay(delay, withSpring(1, morph.enter)),
      );
      fade.set(
        interrupted
          ? withTiming(1, motion.timing.feedback)
          : withDelay(delay, withTiming(1, morph.reveal)),
      );
    } else {
      direction.set(-1);
      const delay = charIndex * morph.stagger;
      progress.set(withDelay(delay, withTiming(0, morph.exit)));
      fade.set(withDelay(delay, withTiming(0, morph.exit)));
    }

    // Effect reactivation must always restore the target. A persistent phase
    // guard would skip setup after Reanimated cancels values during cleanup.
    return () => {
      cancelAnimation(progress);
      cancelAnimation(fade);
    };
  }, [isExiting, animateIn, interrupted, charIndex, direction, progress, fade]);

  const transform = useDerivedValue(() => {
    const settled = progress.get();
    const away = 1 - settled;
    const leaving = direction.get() < 0;
    return [
      { translateX: gx.get() + (leaving ? morph.exitRight * away : 0) },
      {
        translateY:
          baselineY + (leaving ? -morph.exitUp : morph.enterRise) * away,
      },
      { scale: morph.scale + (1 - morph.scale) * settled },
    ];
  });
  const blur = useDerivedValue(() => blurMax * (1 - fade.get()));
  // Scale around the glyph's centre rather than the baseline origin.
  const origin = useMemo(
    () => ({ x: glyphWidth / 2, y: -fontSize * 0.34 }),
    [glyphWidth, fontSize],
  );

  return (
    <Group transform={transform} origin={origin} opacity={fade}>
      <SkiaText x={0} y={0} text={char} font={font} color={color} />
      <BlurMask blur={blur} style="normal" />
    </Group>
  );
});

type AnimatedTextProps = {
  text: string;
  style?: StyleProp<TextStyle>;
  containerStyle?: StyleProp<ViewStyle>;
  width?: number;
  /** Layout height. The canvas includes overflow for glyph travel and blur. */
  height?: number;
  blurMax?: number;
  truncate?: boolean;
};

export function AnimatedText({
  text,
  style,
  containerStyle,
  width = DEFAULT_WIDTH,
  height = CANVAS_HEIGHT,
  blurMax = morph.blur,
  truncate = false,
}: AnimatedTextProps) {
  const { theme } = useUnistyles();
  const flat = (RNStyleSheet.flatten(style) ?? {}) as TextStyle;
  const fontSize =
    typeof flat.fontSize === "number" ? flat.fontSize : DEFAULT_FONT_SIZE;
  const color =
    typeof flat.color === "string" ? flat.color : theme.colors.foreground;
  const reducedMotion = useReducedMotion();
  const { fontScale } = useWindowDimensions();
  const font = useFont(
    FONTS[flat.fontFamily ?? theme.fonts.display] ?? FONTS[theme.fonts.display],
    fontSize,
  );

  // Native text shapes joined scripts, bidi, combining marks and emoji as
  // runs; Dynamic Type and Reduce Motion skip the spatial glyph choreography.
  const nativeText =
    needsNativeText(text) ||
    Boolean(font?.getGlyphIDs(text).some((glyph) => glyph === 0));
  const forceNative = nativeText || reducedMotion || fontScale > 1;

  // Latches once native text has been on screen, so a later canvas mount can
  // never blank a title the reader is already looking at. Native shaping
  // latches on the next tick, having painted; a pending font gets the hold.
  const [paintedNative, setPaintedNative] = useState(false);
  useEffect(() => {
    if (paintedNative) return;
    // A resolved font with nothing painted yet is the one case that may
    // stagger in, so it is also the one case that starts no timer.
    if (font && !forceNative) return;
    const timer = setTimeout(
      () => setPaintedNative(true),
      forceNative ? 0 : FONT_HOLD_MS,
    );
    return () => clearTimeout(timer);
  }, [paintedNative, forceNative, font]);

  const { mode, animateOnMount } = resolveMorphRender(
    Boolean(font),
    forceNative,
    paintedNative,
  );

  // The `!font` test never decides the branch, since mode is only "morph" once
  // the font resolves. It is what narrows the type for the canvas below.
  if (!font || mode !== "morph") {
    return (
      <View style={[styles.container, { width }, containerStyle]}>
        <RNText
          style={[
            style,
            { maxWidth: width },
            nativeText && { fontFamily: undefined },
            // Laid out but unpainted: the canvas is about to rise into this
            // slot, and the reader must not watch a title appear then vanish.
            mode === "hold" && styles.held,
          ]}
          numberOfLines={truncate ? 1 : undefined}
        >
          {text}
        </RNText>
      </View>
    );
  }

  // Compact header slots must not crop the rising/blurred letters at their
  // edges: the canvas extends past the slot on every side.
  const overscan = Math.ceil(
    Math.max(morph.enterRise, morph.exitUp, morph.exitRight) + blurMax * 3,
  );
  const baselineY = overscan + height / 2 + fontSize * 0.34;

  return (
    <MorphText
      text={text}
      font={font}
      fontSize={fontSize}
      color={color}
      width={width}
      height={height}
      overscan={overscan}
      baselineY={baselineY}
      blurMax={blurMax}
      truncate={truncate}
      animateOnMount={animateOnMount}
      containerStyle={containerStyle}
    />
  );
}

// Mounts only when the font is ready. Its initial scene staggers in only when
// the slot painted nothing before it, so rebuilding a native header never
// replays a transparent title. Unmounting when native shaping takes over also
// drops any stale exit glyphs.
function MorphText({
  text,
  font,
  fontSize,
  color,
  width,
  height,
  overscan,
  baselineY,
  blurMax,
  truncate,
  animateOnMount,
  containerStyle,
}: {
  text: string;
  font: SkFont;
  fontSize: number;
  color: string;
  width: number;
  height: number;
  overscan: number;
  baselineY: number;
  blurMax: number;
  truncate: boolean;
  animateOnMount: boolean;
  containerStyle?: StyleProp<ViewStyle>;
}) {
  const measure = useMemo(
    () => (char: string) =>
      font
        .getGlyphWidths(font.getGlyphIDs(char))
        .reduce((sum, advance) => sum + advance, 0),
    [font],
  );
  const [mount] = useState(() => {
    const laid = layoutMorphText(text, width, overscan, measure, truncate);
    if (!animateOnMount || laid.length === 0) {
      return { cells: laid, deadline: null as number | null };
    }
    const now = performance.now();
    return {
      // Reconciling against no previous scene marks every glyph as added, so
      // the whole title staggers in the way a text change does.
      cells: reconcileMorphCells(
        [],
        laid,
        now,
        morph.exit.duration,
        morph.stagger,
      ),
      // Record the entrance as a running transition. A title that changes
      // mid-stagger must read as an interruption, not stack a second one.
      deadline: now + morphDuration(laid.length, false),
    };
  });
  const [{ cells, interrupted }, setTransition] = useState(() => ({
    cells: mount.cells,
    interrupted: false,
  }));
  const scene = useRef(mount.cells);
  const lastChange = useRef<MorphTransition>({
    text,
    deadline: mount.deadline,
  });

  useEffect(() => {
    let cancelled = false;
    const now = performance.now();
    const present = layoutMorphText(text, width, overscan, measure, truncate);
    const { interrupted, next: transition } = advanceMorphTransition(
      lastChange.current,
      text,
      present.length,
      now,
      morphDuration,
    );
    const next = reconcileMorphCells(
      scene.current,
      present,
      now,
      morph.exit.duration,
      morph.stagger,
      interrupted,
    );
    scene.current = next;
    lastChange.current = includeMorphExits(transition, next);
    // Reconciling a stateful transition against the previous glyph scene is
    // not a pure render derivation, so state is set from the effect by design.
    setTransition({ cells: next, interrupted });

    // Keep completion entirely on RN. A callback for each departing letter
    // crossed Worklets' remote-function registry and rebuilt the Skia scene N
    // times. One cancellable batch also prevents an old exit from deleting a
    // letter that returned and started another exit in the meantime.
    const lastExit = next.reduce(
      (latest, cell) => Math.max(latest, cell.exitAt ?? 0),
      0,
    );
    const timer =
      lastExit > now
        ? setTimeout(
            () => {
              if (cancelled) return;
              const settled = pruneMorphCells(scene.current, performance.now());
              scene.current = settled;
              setTransition((current) => ({ ...current, cells: settled }));
            },
            lastExit - now + 80,
          )
        : undefined;

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [text, width, overscan, measure, truncate]);

  return (
    <View
      style={[styles.container, { width, height }, containerStyle]}
      accessible
      accessibilityLabel={text}
    >
      <Canvas
        pointerEvents="none"
        style={{
          position: "absolute",
          left: -overscan,
          top: -overscan,
          width: width + overscan * 2,
          height: height + overscan * 2,
        }}
      >
        {cells.map((cell) => (
          <CharGlyph
            key={cell.key}
            char={cell.char}
            x={cell.x}
            glyphWidth={cell.width}
            charIndex={cell.index}
            isExiting={cell.phase === "exit"}
            animateIn={cell.animateIn ?? false}
            interrupted={interrupted}
            font={font}
            color={color}
            fontSize={fontSize}
            baselineY={baselineY}
            blurMax={blurMax}
          />
        ))}
      </Canvas>
    </View>
  );
}

const styles = StyleSheet.create(() => ({
  container: {
    alignItems: "center",
    justifyContent: "center",
  },
  held: {
    opacity: 0,
  },
}));
