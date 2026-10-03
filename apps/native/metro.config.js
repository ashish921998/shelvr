const { getPostHogExpoConfig } = require("posthog-react-native/metro");
const path = require("path");

// Find the project and workspace directories
const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, "../..");

// PostHog wraps Expo's default Metro config to stamp a debug/chunk id into the
// production bundle. Error tracking matches an uploaded source map to a bundle
// by that id, so without it a Hermes crash stack cannot be symbolicated.
const config = getPostHogExpoConfig(projectRoot);

// Monorepo: let Metro resolve packages from the workspace root node_modules
config.watchFolders = [monorepoRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(monorepoRoot, "node_modules"),
];
config.resolver.disableHierarchicalLookup = false;

module.exports = config;
