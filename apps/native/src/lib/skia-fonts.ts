// The app's fonts as Skia loads them: from the font file. React Native
// registers the same files by family name, which Skia cannot look up.
export const SKIA_FONTS: Record<string, number> = {
  "CrimsonProRoman-Regular": require("../../assets/fonts/CrimsonProRoman-Regular.ttf"),
  "Satoshi-Regular": require("../../assets/fonts/Satoshi-Regular.otf"),
  "Satoshi-Medium": require("../../assets/fonts/Satoshi-Medium.otf"),
  "Satoshi-Bold": require("../../assets/fonts/Satoshi-Bold.otf"),
};
