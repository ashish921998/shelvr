import type { DemoSample } from "@/lib/onboarding-demo";
import {
  Canvas,
  Circle,
  Group,
  LinearGradient,
  Path,
  RoundedRect,
  vec,
} from "@shopify/react-native-skia";

type Platform = "instagram" | "tiktok";

export const platformOf = (sample: DemoSample): Platform =>
  sample.picture === "food" ||
  sample.kind === "Recipes" ||
  sample.kind === "Videos"
    ? "tiktok"
    : "instagram";

const NOTE =
  "M13.2 3h2.9c.3 2.2 1.6 3.6 3.9 3.9v2.9c-1.5 0-2.8-.4-3.9-1.2v6.1c0 3-2.4 5.3-5.3 5.3S5.5 17.7 5.5 14.7s2.4-5.3 5.3-5.3c.3 0 .6 0 .9.1v3a2.4 2.4 0 1 0 1.5 2.2V3Z";

export function PlatformMark({
  platform,
  size,
}: {
  platform: Platform;
  size: number;
}) {
  const unit = size / 24;
  return (
    <Canvas style={{ width: size, height: size }}>
      <Group transform={[{ scale: unit }]}>
        {platform === "instagram" ? (
          <>
            <RoundedRect x={0} y={0} width={24} height={24} r={6.5}>
              <LinearGradient
                start={vec(2, 24)}
                end={vec(22, 0)}
                colors={["#FEDA75", "#FA7E1E", "#D62976", "#962FBF", "#4F5BD5"]}
              />
            </RoundedRect>
            <RoundedRect
              x={5}
              y={5}
              width={14}
              height={14}
              r={4}
              color="white"
              style="stroke"
              strokeWidth={1.8}
            />
            <Circle
              cx={12}
              cy={12}
              r={3.3}
              color="white"
              style="stroke"
              strokeWidth={1.8}
            />
            <Circle cx={16.1} cy={7.9} r={1} color="white" />
          </>
        ) : (
          <>
            <RoundedRect
              x={0}
              y={0}
              width={24}
              height={24}
              r={6.5}
              color="#000"
            />
            <Group
              transform={[
                { translateX: 1.5 },
                { scale: 0.8 },
                { translateX: 1.4 },
                { translateY: 1.6 },
              ]}
            >
              <Path
                path={NOTE}
                color="#25F4EE"
                transform={[{ translateX: -0.9 }, { translateY: -0.6 }]}
              />
              <Path
                path={NOTE}
                color="#FE2C55"
                transform={[{ translateX: 0.9 }, { translateY: 0.6 }]}
              />
              <Path path={NOTE} color="white" />
            </Group>
          </>
        )}
      </Group>
    </Canvas>
  );
}
