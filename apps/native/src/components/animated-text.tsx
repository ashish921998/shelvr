import { motion } from "@/lib/motion";
import { SKIA_FONTS } from "@/lib/skia-fonts";
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

const morph = motion.textMorph;
const CANVAS_HEIGHT = 56;
// Just under the native header's title slot (~242pt between the bar buttons), so iOS never clamps it.
const DEFAULT_WIDTH = 240;
const DEFAULT_FONT_SIZE = 24;
const FONT_HOLD_MS = motion.duration.enter;

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
    // withDelay keeps its timer running after unmount; cancel it with the glyph.
    return () => {
      cancelAnimation(gx);
    };
  }, [x, interrupted, gx]);

  const firstAppearance = useRef(true);
  useEffect(() => {
    const staggerEntrance = firstAppearance.current && animateIn;
    firstAppearance.current = false;

    // withDelay keeps the previous animation running during its delay, so cancel it explicitly.
    cancelAnimation(progress);
    cancelAnimation(fade);

    if (!isExiting) {
      direction.set(1);
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
    SKIA_FONTS[flat.fontFamily ?? theme.fonts.display] ??
      SKIA_FONTS[theme.fonts.display],
    fontSize,
  );

  const nativeText =
    needsNativeText(text) ||
    Boolean(font?.getGlyphIDs(text).some((glyph) => glyph === 0));
  const forceNative = nativeText || reducedMotion || fontScale > 1;

  const [paintedNative, setPaintedNative] = useState(false);
  useEffect(() => {
    if (paintedNative) return;
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

  if (!font || mode !== "morph") {
    return (
      <View style={[styles.container, { width }, containerStyle]}>
        <RNText
          style={[
            style,
            { maxWidth: width },
            nativeText && { fontFamily: undefined },
            mode === "hold" && styles.held,
          ]}
          numberOfLines={truncate ? 1 : undefined}
        >
          {text}
        </RNText>
      </View>
    );
  }

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
      cells: reconcileMorphCells(
        [],
        laid,
        now,
        morph.exit.duration,
        morph.stagger,
      ),
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
    setTransition({ cells: next, interrupted });

    // A completion callback per departing letter crosses Worklets' remote-function registry and rebuilds the Skia scene N times.
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
