const {
  withAndroidColorsNight,
  AndroidConfig,
} = require("expo/config-plugins");

const { assignColorValue } = AndroidConfig.Colors;

const WINDOW_BACKGROUND_COLOR = "activityBackground";

// `expo-system-ui` writes the window background (`activityBackground`, which
// `AppTheme` points `android:windowBackground` at) into `values/colors.xml`
// only, so under a dark theme the window behind every route stays the light
// palette's cream. Normally nothing shows through, but the module repaints the
// decor view solely from its own `setBackgroundColorAsync` call — it persists
// the colour JS last applied and never restores it — so a rebuilt Activity
// starts on the resource value again, and any pixel the React tree has not
// covered yet reads cream under a dark app.
//
// A night resource closes that at the Android level, before JS runs at all.
module.exports = function withAndroidNightBackground(config, options) {
  const backgroundColor = options?.backgroundColor;
  if (!backgroundColor) {
    throw new Error(
      "withAndroidNightBackground requires a backgroundColor for the dark window background.",
    );
  }

  return withAndroidColorsNight(config, (mod) => {
    mod.modResults = assignColorValue(mod.modResults, {
      name: WINDOW_BACKGROUND_COLOR,
      value: backgroundColor,
    });
    return mod;
  });
};
