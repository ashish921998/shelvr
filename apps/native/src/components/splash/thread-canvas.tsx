import {
  Canvas,
  Circle,
  Group,
  Path,
  Skia,
  type SkPath,
  type SkPathBuilder,
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
  SCHEDULE,
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

const MORPH_FROM = 0.6;
const MORPH_TO = 0.85;

type ThreadCanvasProps = {
  width: number;
  height: number;
  clock: SharedValue<number>;
  palette: SplashPalette;
};

function addStroke(path: SkPathBuilder, stroke: Stroke, seed: number) {
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

function buildGlyphPaths(mark: Mark): { pen: SkPath; heavy: SkPath | null } {
  const pen = Skia.PathBuilder.Make();
  let heavy: SkPathBuilder | null = null;
  for (const stroke of glyphStrokes(mark)) {
    if (stroke.kind === "polyline" && stroke.heavy) {
      heavy = heavy ?? Skia.PathBuilder.Make();
      addStroke(heavy, stroke, mark.wobble);
    } else {
      addStroke(pen, stroke, mark.wobble);
    }
  }
  return { pen: pen.detach(), heavy: heavy?.detach() ?? null };
}

function buildThreadPath(points: Point[]): SkPath {
  const path = Skia.PathBuilder.Make();
  points.forEach(([x, y], index) => {
    if (index === 0) path.moveTo(x, y);
    else path.lineTo(x, y);
  });
  return path.detach();
}

let stitchPath: SkPath | null = null;
function getStitchPath(): SkPath {
  if (!stitchPath) {
    stitchPath = Skia.PathBuilder.Make()
      .moveTo(-STITCH_HALF_WIDTH, 0)
      .lineTo(STITCH_HALF_WIDTH, 0)
      .detach();
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

  const travel = useDerivedValue(() =>
    easeInOut(
      span(clock.get(), mark.travelAt, mark.travelAt + mark.travelDuration),
    ),
  );

  const transform = useDerivedValue(() => {
    const appeared = easeInOut(
      span(clock.get(), mark.appearAt, mark.appearAt + SCHEDULE.appearDuration),
    );
    const g = travel.get();
    return [
      { translateX: mark.x + (targetX - mark.x) * g },
      {
        translateY:
          mark.y + (SHELF_Y - mark.y) * g - Math.sin(g * Math.PI) * TRAVEL_LIFT,
      },
      { rotate: mark.rotation * (1 - g) },
      { scale: (0.6 + 0.4 * appeared) * (1 - 0.35 * g) },
    ];
  });

  const glyphOpacity = useDerivedValue(() => {
    const appeared = easeInOut(
      span(clock.get(), mark.appearAt, mark.appearAt + SCHEDULE.appearDuration),
    );
    return (
      appeared * MARK_OPACITY * (1 - span(travel.get(), MORPH_FROM, MORPH_TO))
    );
  });

  const stitchOpacity = useDerivedValue(() => {
    const appeared = easeInOut(
      span(clock.get(), mark.appearAt, mark.appearAt + SCHEDULE.appearDuration),
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
      easeInOut(
        span(clock.get(), mote.appearAt, mote.appearAt + SCHEDULE.dustDuration),
      ) * DUST_OPACITY,
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

function Burst({
  color,
  clock,
}: {
  color: string;
  clock: SharedValue<number>;
}) {
  const empty = useMemo(() => Skia.Path.Make(), []);

  const path = useDerivedValue(() => {
    const progress = span(clock.get(), TIMELINE.burstFrom, TIMELINE.burstTo);
    if (progress <= 0 || progress >= 1) return empty;
    const skPath = Skia.PathBuilder.Make();
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
    return skPath.detach();
  });

  const opacity = useDerivedValue(() => {
    const progress = span(clock.get(), TIMELINE.burstFrom, TIMELINE.burstTo);
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
              color={palette[mark.tone]}
              clock={clock}
            />
          ))}
        </Group>
      </Group>
    </Canvas>
  );
}
