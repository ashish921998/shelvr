import {
  GlassView as ExpoGlassView,
  isGlassEffectAPIAvailable,
  isLiquidGlassAvailable,
} from "expo-glass-effect";
import { Platform, View } from "react-native";
import type { ViewProps } from "react-native";

type GlassViewProps = React.ComponentProps<typeof ExpoGlassView>;

export const hasLiquidGlass =
  isLiquidGlassAvailable() && isGlassEffectAPIAvailable();

export function GlassView({
  style,
  fallbackStyle,
  children,
  ...props
}: GlassViewProps & { fallbackStyle?: ViewProps["style"] }) {
  if (Platform.OS === "ios") {
    return (
      <ExpoGlassView style={style} {...props}>
        {children}
      </ExpoGlassView>
    );
  }

  return (
    <View
      style={[
        style,
        { backgroundColor: "rgba(255, 255, 255, 0.12)" },
        fallbackStyle,
      ]}
    >
      {children}
    </View>
  );
}
