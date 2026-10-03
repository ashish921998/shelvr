const {
  AndroidConfig,
  withAndroidColors,
  withAndroidColorsNight,
  withAndroidStyles,
} = require("expo/config-plugins");

// AppCompat's colorAccent tints native Alert.alert buttons, pickers, and the
// text cursor. Left unset it falls back to Material's stock teal. Native
// resources are fixed at build time, so they take the theme's `primaryText`
// (amber text that clears 4.5:1) for the light and default dark palettes in
// src/unistyles.ts. The neutral dark palette keeps the warm dark accent.
const ACCENT = {
  light: "#935d09",
  dark: "#f0c078",
};

function setAccent(colors, value) {
  return AndroidConfig.Colors.assignColorValue(colors, {
    name: "colorAccent",
    value,
  });
}

function withAndroidAccent(config) {
  config = withAndroidColors(config, (mod) => {
    mod.modResults = setAccent(mod.modResults, ACCENT.light);
    return mod;
  });
  config = withAndroidColorsNight(config, (mod) => {
    mod.modResults = setAccent(mod.modResults, ACCENT.dark);
    return mod;
  });
  return withAndroidStyles(config, (mod) => {
    mod.modResults = AndroidConfig.Styles.assignStylesValue(mod.modResults, {
      add: true,
      parent: AndroidConfig.Styles.getAppThemeGroup(),
      name: "colorAccent",
      value: "@color/colorAccent",
    });
    return mod;
  });
}

module.exports = withAndroidAccent;
module.exports.ACCENT = ACCENT;
