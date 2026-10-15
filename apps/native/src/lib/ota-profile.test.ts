import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(
  new URL("../../.eas/workflows/native-update.yml", import.meta.url),
  "utf8",
);
const eas = JSON.parse(
  readFileSync(new URL("../../eas.json", import.meta.url), "utf8"),
) as {
  build: Record<
    string,
    {
      extends?: string;
      channel?: string;
      environment?: string;
      env?: Record<string, string>;
    }
  >;
};

function resolveProfile(name: string): {
  channel?: string;
  environment?: string;
  env: Record<string, string>;
} {
  const profile = eas.build[name];
  const parent = profile.extends
    ? resolveProfile(profile.extends)
    : { env: {} };
  return { ...parent, ...profile, env: { ...parent.env, ...profile.env } };
}

function evaluate(key: string, profile: string): string {
  const expression = workflow.match(
    new RegExp(`^\\s+${key}: \\$\\{\\{ (.+) \\}\\}$`, "m"),
  )?.[1];
  if (!expression) throw new Error(`Missing workflow expression for ${key}`);
  return runInNewContext(expression, { inputs: { profile } });
}

describe("OTA profile mapping", () => {
  it.each(Object.keys(eas.build))(
    "matches the native build configuration for %s",
    (profile) => {
      const build = resolveProfile(profile);
      expect(evaluate("channel", profile)).toBe(build.channel);
      expect(evaluate("environment", profile)).toBe(build.environment);
      expect(evaluate("APP_VARIANT", profile)).toBe(build.env.APP_VARIANT);
      expect(evaluate("ANDROID_BUILD_ARCHS", profile)).toBe(
        build.env.ANDROID_BUILD_ARCHS ?? "",
      );
    },
  );
});
