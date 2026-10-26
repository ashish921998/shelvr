const { getPostHogExpoConfig } = require("posthog-react-native/metro");
const path = require("path");

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, "../..");

const config = getPostHogExpoConfig(projectRoot);

config.watchFolders = [monorepoRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(monorepoRoot, "node_modules"),
];
config.resolver.disableHierarchicalLookup = false;

// RevenueCat's browser SDK serves Expo Go and the web only; see the stub.
const REVENUECAT_BROWSER_SDK = "@revenuecat/purchases-js-hybrid-mappings";
const revenueCatBrowserStub = path.resolve(
  projectRoot,
  "metro/revenuecat-browser-mode.js",
);
const upstreamResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (
    moduleName === REVENUECAT_BROWSER_SDK &&
    (platform === "ios" || platform === "android")
  ) {
    return { type: "sourceFile", filePath: revenueCatBrowserStub };
  }
  return (upstreamResolveRequest ?? context.resolveRequest)(
    context,
    moduleName,
    platform,
  );
};

module.exports = config;
