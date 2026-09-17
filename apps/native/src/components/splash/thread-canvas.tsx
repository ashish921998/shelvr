import {
  Canvas,
  Circle,
  Group,
  Path,
  Skia,
  type SkPath,
} from "@shopify/react-native-skia";
import { memo, useMemo } from "react";
import { useDerivedValue, type SharedValue } from "react-native-reanimated";

import {
  applyWobble,
  buildComposition,
  CENTER_X,
  CENTER_Y,
  DESIGN_WIDTH,
  easeInOut,
  glyphStrokes,
  shelfSlotX,
  SHELF_Y,
  span,
  STITCH_HALF_WIDTH,
  TRAVEL_LIFT,
  type Composition,
  type Dust,
  type Mark,
  type Point,
  type Stroke,
} from "@/lib/splash/composition";
import { SPLASH_ANCHOR_Y, TIMELINE, type SplashPalette } from "./timeline";

// The moving layer of the launch animation, drawn in one Skia canvas: the
// thread, the dust along it, the thirty sketched saves, and the ring that
// breaks outward as they land. Every node reads the same `clock` shared value
// (seconds since the animation started) on the UI thread, so nothing here
// re-renders per frame.

// Stroke weights are in design-space units; the root group's scale carries them
// up to the real screen along with everything else.
const PEN_WIDTH = 1.1;
const HEAVY_PEN_WIDTH = 2;
const STITCH_WIDTH = 1.5;
const THREAD_WIDTH = 1.3;
const THREAD_OPACITY = 0.92;
const MARK_OPACITY = 0.9;
const DUST_OPACITY = 0.32;

const BURST_TICKS = 8;
const BURST_INNER_RADIUS = 24;
const BURST_TICK_LENGTH = 5;

/** Fraction of a mark's travel over which the glyph dissolves into a stitch. */
const MORPH_FROM = 0.6;
const MORPH_TO = 0.85;

type ThreadCanvasProps = {
  width: number;
  height: number;
  /** Seconds elapsed since the animation started. */
  clock: SharedValue<number>;
  palette: SplashPalette;
};

/** Turns one glyph stroke into Skia path commands, wobbling as it goes. */
function addStroke(path: SkPath, stroke: Stroke, seed: number) {
  switch (stroke.kind) {
    case "polyline":
    case "squiggle": {
      stroke.points.forEach((point: Point, index: number) => {
        const [x, y] = applyWobble(point, index, seed);
        if (index === 0) path.moveTo(x, y);
        else path.lineTo(x, y);
      });
      if (stroke.kind === "polyline" && stroke.close) path.close();
      break;
    }
    case "arc": {
      const box = Skia.XYWHRect(
        stroke.cx - stroke.r,
        stroke.cy - stroke.r,
        stroke.r * 2,
        stroke.r * 2,
      );
      const toDegrees = (radians: number) => (radians * 180) / Math.PI;
      path.addArc(
        box,
        toDegrees(stroke.from),
        toDegrees(stroke.to - stroke.from),
      );
      break;
    }
    case "circle": {
      path.addCircle(stroke.cx, stroke.cy, stroke.r);
      break;
    }
    case "quad": {
      path.moveTo(stroke.from[0], stroke.from[1]);
      path.quadTo(
        stroke.control[0],
        stroke.control[1],
        stroke.to[0],
        stroke.to[1],
      );
      break;
    }
  }
}

/**
 * A glyph's outline is fixed — only its transform and opacity animate — so both
 * weights are built once and reused for the life of the splash.
 */
function buildGlyphPaths(mark: Mark): { pen: SkPath; heavy: SkPath | null } {
  const pen = Skia.Path.Make();
  let heavy: SkPath | null = null;
  for (const stroke of glyphStrokes(mark)) {
    if (stroke.kind === "polyline" && stroke.heavy) {
      heavy = heavy ?? Skia.Path.Make();
      addStroke(heavy, stroke, mark.wobble);
    } else {
      addStroke(pen, stroke, mark.wobble);
    }
  }
  return { pen, heavy };
}

function buildThreadPath(points: Point[]): SkPath {
  const path = Skia.Path.Make();
  points.forEach(([x, y], index) => {
    if (index === 0) path.moveTo(x, y);
    else path.lineTo(x, y);
  });
  return path;
}

/**
 * Every landed save becomes the same short dash, so one path is built on first
 * use and shared by all thirty.
 */
let stitchPath: SkPath | null = null;
function getStitchPath(): SkPath {
  if (!stitchPath) {
    stitchPath = Skia.Path.Make();
    stitchPath.moveTo(-STITCH_HALF_WIDTH, 0);
    stitchPath.lineTo(STITCH_HALF_WIDTH, 0);
  }
  return stitchPath;
}

const SketchedMark = memo(function SketchedMark({
  mark,
  paths,
  color,
  clock,
}: {
  mark: Mark;
  paths: { pen: SkPath; heavy: SkPath | null };
  color: string;
  clock: SharedValue<number>;
}) {
  const targetX = shelfSlotX(mark.slot);

  // Travel progress, 0 while the mark is still scattered and 1 once it has
  // landed in the shelf row.
  const travel = useDerivedValue(() =>
    easeInOut(
      span(clock.get(), mark.travelAt, mark.travelAt + mark.travelDuration),
    ),
  );

  const transform = useDerivedValue(() => {
    const appeared = easeInOut(
      span(clock.get(), mark.appearAt, mark.appearAt + 0.3),
    );
    const g = travel.get();
    return [
      { translateX: mark.x + (targetX - mark.x) * g },
      // The lift gives the glide an arc, so saves are lobbed onto the shelf
      // rather than dragged along a straight line.
      {
        translateY:
          mark.y + (SHELF_Y - mark.y) * g - Math.sin(g * Math.PI) * TRAVEL_LIFT,
      },
      { rotate: mark.rotation * (1 - g) },
      { scale: (0.6 + 0.4 * appeared) * (1 - 0.35 * g) },
    ];
  });

  // The glyph and its stitch cross-fade through the last stretch of the glide.
  const glyphOpacity = useDerivedValue(() => {
    const appeared = easeInOut(
      span(clock.get(), mark.appearAt, mark.appearAt + 0.3),
    );
    return (
      appeared * MARK_OPACITY * (1 - span(travel.get(), MORPH_FROM, MORPH_TO))
    );
  });

  const stitchOpacity = useDerivedValue(() => {
    const appeared = easeInOut(
      span(clock.get(), mark.appearAt, mark.appearAt + 0.3),
    );
    return appeared * MARK_OPACITY * span(travel.get(), MORPH_FROM, MORPH_TO);
  });

  return (
    <>
      <Group transform={transform} opacity={glyphOpacity}>
        <Path
          path={paths.pen}
          style="stroke"
          strokeWidth={PEN_WIDTH}
          strokeCap="round"
          strokeJoin="round"
          color={color}
        />
        {paths.heavy ? (
          <Path
            path={paths.heavy}
            style="stroke"
            strokeWidth={HEAVY_PEN_WIDTH}
            strokeCap="round"
            strokeJoin="round"
            color={color}
          />
        ) : null}
      </Group>
      <Group transform={transform} opacity={stitchOpacity}>
        <Path
          path={getStitchPath()}
          style="stroke"
          strokeWidth={STITCH_WIDTH}
          strokeCap="round"
          color={color}
        />
      </Group>
    </>
  );
});

const DustMote = memo(function DustMote({
  mote,
  color,
  clock,
}: {
  mote: Dust;
  color: string;
  clock: SharedValue<number>;
}) {
  const opacity = useDerivedValue(
    () =>
      easeInOut(span(clock.get(), mote.appearAt, mote.appearAt + 0.4)) *
      DUST_OPACITY,
  );
  return (
    <Circle
      cx={mote.x}
      cy={mote.y}
      r={mote.radius}
      color={color}
      opacity={opacity}
    />
  );
});

/** The ring of ticks that breaks outward as the last saves reach the shelf. */
function Burst({
  color,
  clock,
}: {
  color: string;
  clock: SharedValue<number>;
}) {
  const path = useDerivedValue(() => {
    const progress = span(clock.get(), TIMELINE.burstFrom, TIMELINE.burstTo);
    const skPath = Skia.Path.Make();
    // Radii open outward with the burst, so the ring expands as it dims.
    const inner = BURST_INNER_RADIUS + progress * 24;
    const outer = inner + BURST_TICK_LENGTH + progress * 7;
    for (let i = 0; i < BURST_TICKS; i++) {
      const angle = (i * Math.PI) / 4 + 0.3;
      skPath.moveTo(
        CENTER_X + Math.cos(angle) * inner,
        CENTER_Y + Math.sin(angle) * inner,
      );
      skPath.lineTo(
        CENTER_X + Math.cos(angle) * outer,
        CENTER_Y + Math.sin(angle) * outer,
      );
    }
    return skPath;
  });

  const opacity = useDerivedValue(() => {
    const progress = span(clock.get(), TIMELINE.burstFrom, TIMELINE.burstTo);
    // Fully transparent outside the window, so the ring never sits static.
    if (progress <= 0 || progress >= 1) return 0;
    return (1 - progress) * 0.9;
  });

  return (
    <Group opacity={opacity}>
      <Path
        path={path}
        style="stroke"
        strokeWidth={PEN_WIDTH}
        strokeCap="round"
        color={color}
      />
    </Group>
  );
}

export function ThreadCanvas({
  width,
  height,
  clock,
  palette,
}: ThreadCanvasProps) {
  const composition: Composition = useMemo(() => buildComposition(), []);

  const threadAbove = useMemo(
    () => buildThreadPath(composition.threadAbove),
    [composition],
  );
  const threadBelow = useMemo(
    () => buildThreadPath(composition.threadBelow),
    [composition],
  );
  const glyphPaths = useMemo(
    () => composition.marks.map((mark) => buildGlyphPaths(mark)),
    [composition],
  );

  // The composition is authored at 390x844; scale it to the real screen and
  // pin its centre to the same point the lockup sits on.
  const rootTransform = useMemo(() => {
    const scale = width / DESIGN_WIDTH;
    return [
      { translateX: width / 2 },
      { translateY: height * SPLASH_ANCHOR_Y },
      { scale },
      { translateX: -CENTER_X },
      { translateY: -CENTER_Y },
    ];
  }, [width, height]);

  // One fade carries the whole drawn layer out once the lockup has landed.
  const fade = useDerivedValue(
    () =>
      1 -
      easeInOut(
        span(clock.get(), TIMELINE.canvasFadeFrom, TIMELINE.canvasFadeTo),
      ),
  );

  const aboveEnd = useDerivedValue(() =>
    easeInOut(
      span(clock.get(), TIMELINE.threadAboveFrom, TIMELINE.threadAboveTo),
    ),
  );
  const belowEnd = useDerivedValue(() =>
    easeInOut(
      span(clock.get(), TIMELINE.threadBelowFrom, TIMELINE.threadBelowTo),
    ),
  );

  const toneColors = {
    ink: palette.ink,
    accent: palette.accent,
    cool: palette.cool,
  };

  return (
    <Canvas style={{ width, height }} pointerEvents="none">
      <Group transform={rootTransform}>
        <Group opacity={fade}>
          {composition.dust.map((mote, index) => (
            <DustMote
              key={`dust-${index}`}
              mote={mote}
              color={palette.ink}
              clock={clock}
            />
          ))}

          <Group opacity={THREAD_OPACITY}>
            <Path
              path={threadAbove}
              style="stroke"
              strokeWidth={THREAD_WIDTH}
              strokeCap="round"
              strokeJoin="round"
              color={palette.thread}
              start={0}
              end={aboveEnd}
            />
            <Path
              path={threadBelow}
              style="stroke"
              strokeWidth={THREAD_WIDTH}
              strokeCap="round"
              strokeJoin="round"
              color={palette.thread}
              start={0}
              end={belowEnd}
            />
          </Group>

          <Burst color={palette.thread} clock={clock} />

          {composition.marks.map((mark, index) => (
            <SketchedMark
              key={`mark-${index}`}
              mark={mark}
              paths={glyphPaths[index]}
              color={toneColors[mark.tone]}
              clock={clock}
            />
          ))}
        </Group>
      </Group>
    </Canvas>
  );
}
