const { withMainActivity } = require("expo/config-plugins");

// Android keeps Shelvr's task in recents after the OS kills the process. A
// share into Shelvr then recreates MainActivity with the task's OLD intent and
// delivers the share through onNewIntent. In a release build expo-updates is
// still picking the bundle at that moment, and Expo's ReactActivityDelegateWrapper
// returns early from onNewIntent until the app has loaded, so expo-sharing's
// listener never sees the share: no payload, no url event, and the app opens
// on Home. Stashing the share where expo-sharing reads it lets the JS resume
// path (useResumePendingShare) route to /share once auth has loaded.
const MARKER = "shelvr-share-new-intent";

const IMPORTS = [
  "android.content.Intent",
  "expo.modules.sharing.SharingSingleton",
];

const OVERRIDE = `
  // ${MARKER}: see plugins/with-android-share-new-intent.js
  override fun onNewIntent(intent: Intent) {
    val action = intent.action
    if (intent.type != null &&
        (action == Intent.ACTION_SEND || action == Intent.ACTION_SEND_MULTIPLE)) {
      SharingSingleton.intent = Intent(intent)
    }
    super.onNewIntent(intent)
  }
`;

function addToMainActivity(contents) {
  if (contents.includes(MARKER)) return contents;
  if (!/class MainActivity\s*:\s*ReactActivity\(\)\s*\{/.test(contents)) {
    throw new Error(
      "with-android-share-new-intent: MainActivity class not found.",
    );
  }
  for (const name of IMPORTS) {
    if (!contents.includes(`import ${name}`)) {
      contents = contents.replace(/^(package .+)$/m, `$1\nimport ${name}`);
    }
  }
  return contents.replace(
    /(class MainActivity\s*:\s*ReactActivity\(\)\s*\{)/,
    `$1\n${OVERRIDE}`,
  );
}

module.exports = function withAndroidShareNewIntent(config) {
  return withMainActivity(config, (mod) => {
    if (mod.modResults.language !== "kt") {
      throw new Error(
        "with-android-share-new-intent: expected a Kotlin MainActivity.",
      );
    }
    mod.modResults.contents = addToMainActivity(mod.modResults.contents);
    return mod;
  });
};

module.exports.addToMainActivity = addToMainActivity;
