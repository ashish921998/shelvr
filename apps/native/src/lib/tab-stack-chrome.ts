import * as Haptics from "expo-haptics";
import { type Href, useRouter } from "expo-router";
import { PlatformColor } from "react-native";
import { useUnistyles } from "react-native-unistyles";

const isIos = process.env.EXPO_OS === "ios";

type Options = {
  headerTransparent?: boolean;
};

export function useTabStackChrome({ headerTransparent = isIos }: Options = {}) {
  const router = useRouter();
  const { theme } = useUnistyles();
  const labelColor = isIos ? PlatformColor("label") : theme.colors.foreground;

  const haptic = () => {
    if (isIos) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  };

  const tap = (href: Href) => () => {
    haptic();
    router.push(href);
  };

  // Per-layout extras (tint, title style) compose at the call site via
  // spread — React Navigation merges them over these shared defaults.
  const screenOptions = {
    headerTransparent,
    headerStyle:
      process.env.EXPO_OS === "android" && !headerTransparent
        ? { backgroundColor: theme.colors.background }
        : undefined,
    headerShadowVisible: false,
    headerTitleAlign: "center" as const,
  };

  return { haptic, labelColor, screenOptions, tap };
}
