import { Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const NAVIGATION_BAR_HEIGHT = Platform.select({
  ios: 44,
  android: 56,
  default: 56,
});

export function useAppHeaderHeight() {
  const insets = useSafeAreaInsets();
  return insets.top + NAVIGATION_BAR_HEIGHT;
}
