const { withAppBuildGradle } = require("expo/config-plugins");

// expo-superwall 1.5.0 pulls Google Play Billing 9.1.0, and Gradle resolves one
// Billing version for the whole app. RevenueCat (react-native-purchases 10.6,
// purchases-android 10.16) is built against Billing 8.3.0, so letting 9.1.0 win
// would move every RevenueCat purchase onto a library it was never tested with.
// Superwall's changelog documents this pin and supports Billing 8 and 9. Raise
// it only together with a RevenueCat release that moves to Billing 9.
const BILLING_VERSION = "8.3.0";
const MARKER = "shelvr-billing-pin";

const BLOCK = `
// ${MARKER}: see plugins/with-android-billing-pin.js
configurations.all {
    resolutionStrategy.force 'com.android.billingclient:billing:${BILLING_VERSION}'
}
`;

// The marked block, as any version of this plugin wrote it.
const BLOCK_PATTERN = new RegExp(
  `\\n// ${MARKER}:[^\\n]*\\nconfigurations\\.all \\{\\n[^}]*\\}\\n`,
);

function addBillingPin(contents) {
  // Replace rather than skip, so a non-clean prebuild picks up a new version.
  if (BLOCK_PATTERN.test(contents)) {
    return contents.replace(BLOCK_PATTERN, BLOCK);
  }
  return contents.trimEnd() + "\n" + BLOCK;
}

function withAndroidBillingPin(config) {
  return withAppBuildGradle(config, (mod) => {
    if (mod.modResults.language !== "groovy") {
      throw new Error(
        "with-android-billing-pin: app/build.gradle must be Groovy.",
      );
    }
    mod.modResults.contents = addBillingPin(mod.modResults.contents);
    return mod;
  });
}

module.exports = withAndroidBillingPin;
module.exports.addBillingPin = addBillingPin;
module.exports.BILLING_VERSION = BILLING_VERSION;
