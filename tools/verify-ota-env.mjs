import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";

// Read only the values EAS made available, never inherited runner variables.
const env = parseEnv(readFileSync(process.argv[2], "utf8"));
const requirements = {
  EXPO_PUBLIC_CONVEX_URL: (value) =>
    isOrigin(value, "https://amiable-setter-120.convex.cloud"),
  EXPO_PUBLIC_CONVEX_SITE_URL: (value) =>
    isOrigin(value, "https://amiable-setter-120.convex.site"),
  EXPO_PUBLIC_REVENUECAT_IOS_KEY: (value) => /^appl_\S+$/.test(value ?? ""),
  EXPO_PUBLIC_REVENUECAT_ANDROID_KEY: (value) => /^goog_\S+$/.test(value ?? ""),
};

function isOrigin(value, origin) {
  try {
    return new URL(value).href === `${origin}/`;
  } catch {
    return false;
  }
}

for (const [name, validate] of Object.entries(requirements)) {
  if (!validate(env[name])) {
    process.stderr.write(
      `::error::${name} must have a valid production value with plaintext or sensitive visibility in EAS production.\n`,
    );
    process.exitCode = 1;
  }
}

if (env.APP_VARIANT && env.APP_VARIANT !== "production") {
  process.stderr.write(
    "::error::APP_VARIANT in EAS production must be production.\n",
  );
  process.exitCode = 1;
}
