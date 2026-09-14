const { withXcodeProject, IOSConfig } = require("expo/config-plugins");
const { copyFileSync } = require("node:fs");
const { join } = require("node:path");

// Expo Widgets evaluates gallery labels in its own native bundle.
module.exports = function withWidgetLocalization(config) {
  return withXcodeProject(config, (mod) => {
    const project = mod.modResults;
    const targetName = "ExpoWidgetsTarget";
    const target = Object.entries(project.pbxNativeTargetSection()).find(
      ([, value]) =>
        typeof value === "object" &&
        String(value.name).replaceAll('"', "") === targetName,
    );
    if (!target)
      throw new Error("Widget localization requires the Expo Widgets target.");
    copyFileSync(
      join(mod.modRequest.projectRoot, "locales/WidgetLocalizations.xcstrings"),
      join(
        mod.modRequest.platformProjectRoot,
        targetName,
        "Localizable.xcstrings",
      ),
    );
    IOSConfig.XcodeUtils.addResourceFileToGroup({
      filepath: "Localizable.xcstrings",
      groupName: targetName,
      isBuildFile: true,
      project,
      targetUuid: target[0],
    });
    for (const value of Object.values(project.pbxFileReferenceSection())) {
      if (
        typeof value === "object" &&
        String(value.path).replaceAll('"', "") === "Localizable.xcstrings"
      ) {
        value.lastKnownFileType = "text.json.xcstrings";
        if (value.explicitFileType === undefined) delete value.explicitFileType;
        if (value.fileEncoding === undefined) delete value.fileEncoding;
      }
    }
    return mod;
  });
};
