import { useWindowDimensions } from "react-native";

export const HEADLINE_MAX_SCALE = 2;

export const LARGE_TEXT_SCALE = 1.4;

export function useLargeText(): boolean {
  return useWindowDimensions().fontScale > LARGE_TEXT_SCALE;
}
