import { centeredSheetInsets } from "@/lib/side-insets";
import { useCallback, useState } from "react";
import { useWindowDimensions, type LayoutChangeEvent } from "react-native";
import { useUnistyles } from "react-native-unistyles";

export function useSheetInsets() {
  const { rt } = useUnistyles();
  const { width: windowWidth } = useWindowDimensions();
  const [sheetWidth, setSheetWidth] = useState<number | null>(null);
  const onLayout = useCallback((event: LayoutChangeEvent) => {
    setSheetWidth(event.nativeEvent.layout.width);
  }, []);
  return {
    insets: centeredSheetInsets(
      sheetWidth ?? windowWidth,
      windowWidth,
      rt.insets,
    ),
    onLayout,
  };
}
