import {
  Canvas,
  DashPathEffect,
  Group,
  Path,
  Skia,
} from "@shopify/react-native-skia";
import { Easing, interpolate, useDerivedValue } from "react-native-reanimated";
import { useUnistyles } from "react-native-unistyles";

import { useLoop } from "./stitch-loader";

// The full-screen loader: the S sewing itself in stitches, the same thread the
// splash ends on.

/** The mark's outline, the same path `splash-mark.tsx` draws. */
const MARK_PATH = Skia.Path.MakeFromSVGString(
  "M320 224h400c44.2 0 80 35.8 80 80v176c0 44.2-35.8 80-80 80H416v80h288c44.2 0 80 35.8 80 80s-35.8 80-80 80H304c-44.2 0-80-35.8-80-80V544c0-44.2 35.8-80 80-80h304v-80H320c-44.2 0-80-35.8-80-80s35.8-80 80-80Z",
)!;
/** The glyph's bounds in that path, padded so the stitches' caps fit. */
const MARK_BOX = { origin: 224 - 24, size: 576 + 48 };
/** Share of each loop spent sewing; the rest holds, then fades. */
const SEWN_AT = 0.62;
const SEW_EASING = Easing.inOut(Easing.quad);

/** The S sewing itself in stitches over a pale S, then fading to start again. */
export function StitchMark({ size = 64 }: { size?: number }) {
  const { theme } = useUnistyles();
  const progress = useLoop(2400, SEW_EASING);
  const end = useDerivedValue(() =>
    interpolate(progress.value, [0, SEWN_AT], [0, 1], "clamp"),
  );
  const opacity = useDerivedValue(() =>
    interpolate(progress.value, [0.86, 1], [1, 0], "clamp"),
  );
  const scale = size / MARK_BOX.size;
  return (
    <Canvas style={{ width: size, height: size }}>
      <Group
        transform={[
          { scale },
          { translateX: -MARK_BOX.origin },
          { translateY: -MARK_BOX.origin },
        ]}
      >
        <Path path={MARK_PATH} color={theme.colors.primarySoft} />
        <Path
          path={MARK_PATH}
          color={theme.colors.primary}
          style="stroke"
          strokeWidth={30}
          strokeCap="round"
          start={0}
          end={end}
          opacity={opacity}
        >
          <DashPathEffect intervals={[46, 38]} />
        </Path>
      </Group>
    </Canvas>
  );
}
