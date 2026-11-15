import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

function readConfig({
  ci,
  overrides = {},
  localFile = true,
  launchFirst = false,
} = {}) {
  const directory = mkdtempSync(join(tmpdir(), "shelvr-e2e-config-"));
  try {
    mkdirSync(join(directory, "tests"));
    writeFileSync(join(directory, "package.json"), '{"type":"module"}');
    symlinkSync(
      join(root, "node_modules"),
      join(directory, "node_modules"),
      "dir",
    );
    for (const file of [
      "e2e.config.ts",
      "tests/launch.ts",
      "tests/seeded-home.ts",
      "tests/poll.ts",
    ]) {
      copyFileSync(join(root, "tools/e2e", file), join(directory, file));
    }
    if (localFile) {
      writeFileSync(
        join(directory, ".env.local"),
        "E2E_DEVICE=local-development\nE2E_QA_DEVICE=local-qa\nE2E_METRO_PORT=8197\n",
      );
    }
    const env = { ...process.env };
    for (const key of Object.keys(env)) {
      if (key === "CI" || key.startsWith("E2E_")) delete env[key];
    }
    if (ci !== undefined) env.CI = ci;
    Object.assign(env, overrides);
    const configUrl = pathToFileURL(join(directory, "e2e.config.ts")).href;
    const launchUrl = pathToFileURL(join(directory, "tests/launch.ts")).href;
    const result = spawnSync(
      process.execPath,
      [
        "--experimental-strip-types",
        "--input-type=module",
        "-e",
        `
        if (${launchFirst}) await import(${JSON.stringify(launchUrl)});
        const { default: config } = await import(${JSON.stringify(configUrl)});
        const launch = await import(${JSON.stringify(launchUrl)});
        const app = config.targets[0].app;
        console.log(JSON.stringify({
          device: process.env.E2E_DEVICE ?? null,
          qaDevice: process.env.E2E_QA_DEVICE ?? null,
          commandPort: app.command.args.at(-1),
          readyUrl: app.readyUrl,
          initialUrl: app.launchArguments[1],
          workerPort: launch.METRO_PORT,
        }));
      `,
      ],
      { env, encoding: "utf8" },
    );
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function expectPort(config, port) {
  assert.equal(config.commandPort, port);
  assert.equal(config.workerPort, port);
  assert.equal(config.readyUrl, `http://localhost:${port}/status`);
  assert.ok(config.initialUrl.startsWith(`http://localhost:${port}/`));
}

test("local settings agree across Metro, readiness and app launch", () => {
  const config = readConfig();
  assert.equal(config.device, "local-development");
  assert.equal(config.qaDevice, "local-qa");
  expectPort(config, "8197");
});

test("launch settings are correct when a test imports them before the config", () => {
  const config = readConfig({ launchFirst: true });
  expectPort(config, "8197");
});

for (const ci of ["", "0", "false", " FALSE "]) {
  test(`CI=${JSON.stringify(ci)} keeps local development defaults`, () => {
    const config = readConfig({ ci });
    assert.equal(config.device, "local-development");
    expectPort(config, "8197");
  });
}

for (const ci of ["1", "true"]) {
  test(`CI=${ci} ignores local settings`, () => {
    const config = readConfig({ ci });
    assert.equal(config.device, null);
    assert.equal(config.qaDevice, null);
    expectPort(config, "8091");
  });
}

test("explicit device and port overrides win over local defaults", () => {
  const config = readConfig({
    overrides: { E2E_DEVICE: "explicit-qa", E2E_METRO_PORT: "8297" },
  });
  assert.equal(config.device, "explicit-qa");
  expectPort(config, "8297");
});

test("a checkout without local settings keeps normal defaults", () => {
  const config = readConfig({ localFile: false });
  assert.equal(config.device, null);
  expectPort(config, "8091");
});
