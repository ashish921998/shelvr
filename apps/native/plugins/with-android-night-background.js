const {
  withAndroidColorsNight,
  AndroidConfig,
} = require("expo/config-plugins");

const { assignColorValue } = AndroidConfig.Colors;

// Must match the resource expo-system-ui writes for android:windowBackground.
const WINDOW_BACKGROUND_RESOURCE = "activityBackground";

// `expo-system-ui` writes that resource into `values/colors.xml` only, so under
// a dark theme every pixel the React tree has not covered yet — including a
// rebuilt Activity before JS runs — shows the light palette's cream. A night
// resource fixes it at the Android level instead.
module.exports = function withAndroidNightBackground(config, options) {
  const backgroundColor = options?.backgroundColor;
  if (!backgroundColor) {
    throw new Error(
      "withAndroidNightBackground requires a backgroundColor for the dark window background.",
    );
  }

  return withAndroidColorsNight(config, (mod) => {
    mod.modResults = assignColorValue(mod.modResults, {
      name: WINDOW_BACKGROUND_RESOURCE,
      value: backgroundColor,
    });
    return mod;
  });
};
