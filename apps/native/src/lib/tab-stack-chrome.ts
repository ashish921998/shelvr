import { type Href, useRouter } from "expo-router";
import { PlatformColor } from "react-native";
import { useUnistyles } from "react-native-unistyles";
import { sidePadding } from "@/lib/side-insets";

const isIos = process.env.EXPO_OS === "ios";

type Options = {
  headerTransparent?: boolean;
  softScrollEdge?: boolean;
};

const SOFT_SCROLL_EDGE = { top: "soft" } as const;

export function useTabStackChrome({
  headerTransparent = isIos,
  softScrollEdge = false,
}: Options = {}) {
  const router = useRouter();
  const { theme, rt } = useUnistyles();
  const labelColor = isIos ? PlatformColor("label") : theme.colors.foreground;

  const tap = (href: Href) => () => {
    router.push(href);
  };

  const screenOptions = {
    headerTransparent,
    headerStyle:
      process.env.EXPO_OS === "android" && !headerTransparent
        ? { backgroundColor: theme.colors.background }
        : undefined,
    headerShadowVisible: false,
    headerTitleAlign: "center" as const,
    scrollEdgeEffects: softScrollEdge ? SOFT_SCROLL_EDGE : undefined,
    // Content stops at the side safe areas, such as the strip an unfolded iPhone Duo keeps down
    // its right edge for the status bar, header buttons and tab bar.
    contentStyle: {
      backgroundColor: theme.colors.background,
      ...sidePadding(rt.insets),
    },
  };

  return { labelColor, screenOptions, tap };
}
