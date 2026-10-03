import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { afterEach, describe, expect, it, vi } from "vitest";

const requirePlugin = createRequire(
  new URL("../../plugins/with-google-services.js", import.meta.url),
);
const plugin = requirePlugin("./with-google-services.js");

function writeFirebaseFile(packageName: string) {
  const directory = mkdtempSync(join(tmpdir(), "shelvr-google-services-"));
  const file = join(directory, "google-services.json");
  writeFileSync(
    file,
    JSON.stringify({
      project_info: { project_number: "12345" },
      client: [
        {
          client_info: {
            android_client_info: { package_name: packageName },
            mobilesdk_app_id: "app-id",
          },
          api_key: [{ current_key: "client-key" }],
        },
      ],
    }),
  );
  return { directory, file };
}

async function runMod(
  config: {
    mods: {
      android: Record<
        string,
        (mod: {
          modResults: { language?: string; contents?: string };
          modRequest: { platformProjectRoot: string };
        }) => Promise<{
          modResults: { language?: string; contents?: string };
        }>
      >;
    };
  },
  name: string,
  modResults: { language?: string; contents?: string },
  platformProjectRoot: string,
) {
  return config.mods.android[name]({
    modResults,
    modRequest: { platformProjectRoot },
  });
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Google Services config plugin", () => {
  it("copies the secret and wires both Gradle files", async () => {
    const { directory, file } = writeFirebaseFile("app.shelvr.save");
    vi.stubEnv("GOOGLE_SERVICES_JSON", file);
    vi.stubEnv("EAS_BUILD", "true");
    vi.stubEnv("EAS_BUILD_PLATFORM", "android");

    const config = plugin({ android: { package: "app.shelvr.save" } });
    const project = await runMod(
      config,
      "projectBuildGradle",
      {
        language: "groovy",
        contents: "buildscript { dependencies {\\n} }",
      },
      directory,
    );
    const app = await runMod(
      config,
      "appBuildGradle",
      {
        language: "groovy",
        contents: 'apply plugin: "com.android.application"',
      },
      directory,
    );
    await runMod(config, "dangerous", {}, directory);

    expect(project.modResults.contents).toContain(
      "com.google.gms:google-services:4.4.4",
    );
    expect(app.modResults.contents).toContain(
      "apply plugin: 'com.google.gms.google-services'",
    );
    expect(existsSync(join(directory, "app/google-services.json"))).toBe(true);
    expect(
      readFileSync(join(directory, "app/google-services.json"), "utf8"),
    ).toBe(readFileSync(file, "utf8"));
  });

  it("rejects a Firebase file without the active package", () => {
    const { file } = writeFirebaseFile("app.shelvr.save.preview");
    vi.stubEnv("GOOGLE_SERVICES_JSON", file);
    vi.stubEnv("EAS_BUILD", "true");
    vi.stubEnv("EAS_BUILD_PLATFORM", "android");

    expect(() => plugin({ android: { package: "app.shelvr.save" } })).toThrow(
      /Firebase client for app.shelvr.save/,
    );
  });

  it("requires the secret on EAS Android builds", () => {
    vi.stubEnv("EAS_BUILD", "true");
    vi.stubEnv("EAS_BUILD_PLATFORM", "android");
    vi.stubEnv("GOOGLE_SERVICES_JSON", "");

    expect(() => plugin({ android: { package: "app.shelvr.save" } })).toThrow(
      /require GOOGLE_SERVICES_JSON/,
    );
  });
});
