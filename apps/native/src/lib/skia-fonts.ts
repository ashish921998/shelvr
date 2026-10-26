// Skia loads fonts from the file; it cannot look up the families React Native registers by name.
export const SKIA_FONTS: Record<string, number> = {
  "CrimsonProRoman-Regular": require("../../assets/fonts/CrimsonProRoman-Regular.ttf"),
  "Satoshi-Regular": require("../../assets/fonts/Satoshi-Regular.otf"),
  "Satoshi-Medium": require("../../assets/fonts/Satoshi-Medium.otf"),
  "Satoshi-Bold": require("../../assets/fonts/Satoshi-Bold.otf"),
};
