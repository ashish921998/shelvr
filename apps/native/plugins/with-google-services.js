const {
  withAppBuildGradle,
  withDangerousMod,
  withProjectBuildGradle,
} = require("expo/config-plugins");
const { copyFileSync, mkdirSync, readFileSync } = require("node:fs");
const { dirname, resolve } = require("node:path");

const googleServicesClassPath = "com.google.gms:google-services";
const googleServicesPlugin = "com.google.gms.google-services";
const googleServicesVersion = "4.4.4";

function getGoogleServicesFile(config) {
  if (process.env.EAS_BUILD_PLATFORM === "ios") return null;

  const file = process.env.GOOGLE_SERVICES_JSON;
  const isEasAndroidBuild =
    process.env.EAS_BUILD === "true" &&
    process.env.EAS_BUILD_PLATFORM === "android";

  if (!file) {
    if (isEasAndroidBuild) {
      throw new Error("Android builds require GOOGLE_SERVICES_JSON.");
    }
    return null;
  }

  const sourcePath = resolve(file);
  let firebase;
  try {
    firebase = JSON.parse(readFileSync(sourcePath, "utf8"));
  } catch {
    throw new Error(
      "GOOGLE_SERVICES_JSON must be a readable Firebase JSON file.",
    );
  }

  const packageName = config.android?.package;
  if (
    !packageName ||
    !firebase?.project_info?.project_number ||
    !firebase?.client?.some(
      (client) =>
        client.client_info?.android_client_info?.package_name === packageName &&
        client.client_info?.mobilesdk_app_id &&
        client.api_key?.some((key) => key.current_key),
    )
  ) {
    throw new Error(
      `GOOGLE_SERVICES_JSON requires a Firebase client for ${packageName}.`,
    );
  }

  return sourcePath;
}

function withFirebaseFile(config, sourcePath) {
  return withDangerousMod(config, [
    "android",
    async (mod) => {
      const destinationPath = resolve(
        mod.modRequest.platformProjectRoot,
        "app/google-services.json",
      );
      mkdirSync(dirname(destinationPath), { recursive: true });
      copyFileSync(sourcePath, destinationPath);
      return mod;
    },
  ]);
}

function withFirebaseClassPath(config) {
  return withProjectBuildGradle(config, (mod) => {
    if (mod.modResults.language !== "groovy") return mod;

    const { contents } = mod.modResults;
    if (contents.includes(googleServicesClassPath)) return mod;

    mod.modResults.contents = contents.replace(
      /dependencies\s?{/,
      `dependencies {
        classpath '${googleServicesClassPath}:${googleServicesVersion}'`,
    );
    return mod;
  });
}

function withFirebasePlugin(config) {
  return withAppBuildGradle(config, (mod) => {
    if (mod.modResults.language !== "groovy") return mod;

    const { contents } = mod.modResults;
    const pattern = new RegExp(
      `apply\\s+plugin:\\s+['"]${googleServicesPlugin}['"]`,
    );
    if (pattern.test(contents)) return mod;

    mod.modResults.contents = `${contents}\napply plugin: '${googleServicesPlugin}'`;
    return mod;
  });
}

module.exports = function withGoogleServices(config) {
  const sourcePath = getGoogleServicesFile(config);
  if (!sourcePath) return config;

  config = withFirebaseClassPath(config);
  config = withFirebasePlugin(config);
  return withFirebaseFile(config, sourcePath);
};
