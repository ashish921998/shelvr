import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import verifyCi from "./verify-ci.cjs";
import { verifyIosSubmitCredentials } from "./ios-submit-credentials.mjs";

const validEnv = {
  EXPO_PUBLIC_CONVEX_URL: "https://amiable-setter-120.convex.cloud",
  EXPO_PUBLIC_CONVEX_SITE_URL: "https://amiable-setter-120.convex.site",
  EXPO_PUBLIC_REVENUECAT_IOS_KEY: "appl_fixture",
  EXPO_PUBLIC_REVENUECAT_ANDROID_KEY: "goog_fixture",
  GOOGLE_MAPS_API_KEY: "maps_fixture",
  POSTHOG_PROJECT_TOKEN: "posthog_fixture",
  POSTHOG_HOST: "https://example.com",
};

function validateEnv(values) {
  const directory = mkdtempSync(join(tmpdir(), "shelvr-ota-test-"));
  const path = join(directory, "environment");
  try {
    writeFileSync(
      path,
      Object.entries(values)
        .map(([name, value]) => `${name}=${value}`)
        .join("\n"),
    );
    return spawnSync(
      process.execPath,
      [new URL("./verify-ota-env.mjs", import.meta.url).pathname, path],
      {
        encoding: "utf8",
        env: { ...process.env, ...validEnv },
      },
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test("accepts valid OTA-readable production values", () => {
  assert.equal(validateEnv(validEnv).status, 0);
});

test("rejects Secret-visibility fingerprint inputs omitted by env:pull", () => {
  for (const name of [
    "GOOGLE_MAPS_API_KEY",
    "POSTHOG_PROJECT_TOKEN",
    "POSTHOG_HOST",
  ]) {
    const values = { ...validEnv };
    delete values[name];
    values[`# ${name}`] = "***** (secret)";
    const result = validateEnv(values);
    assert.equal(result.status, 1);
    assert.match(result.stderr, new RegExp(name));
  }
});

const iosCredential = {
  appleAppIdentifier: { bundleIdentifier: "app.fixture" },
  appleTeam: { appleTeamIdentifier: "fixture-team" },
  appStoreConnectApiKeyForSubmissions: { id: "fixture-id" },
};

async function checkIosCredentials(credentials, options = {}) {
  return verifyIosSubmitCredentials({
    token: "fixture-token",
    appId: "fixture-project",
    bundleIdentifier: "app.fixture",
    appleTeamId: "fixture-team",
    fetchImpl: async (url, request) => {
      assert.equal(url, "https://api.expo.dev/graphql");
      const body = JSON.parse(request.body);
      assert.deepEqual(body.variables, { appId: "fixture-project" });
      assert.ok(!body.query.includes("keyP8"));
      return {
        ok: true,
        json: async () => ({
          data: { app: { byId: { iosAppCredentials: credentials } } },
        }),
      };
    },
    ...options,
  });
}

test("accepts an EAS submission key assigned to the production app and team", async () => {
  await checkIosCredentials([iosCredential]);
});

test("rejects missing iOS keys and keys assigned to other apps or teams", async () => {
  for (const credentials of [
    [],
    undefined,
    [{ ...iosCredential, appStoreConnectApiKeyForSubmissions: null }],
    [
      {
        ...iosCredential,
        appleAppIdentifier: { bundleIdentifier: "app.other" },
      },
    ],
    [{ ...iosCredential, appleTeam: { appleTeamIdentifier: "another-team" } }],
  ]) {
    await assert.rejects(
      checkIosCredentials(credentials),
      /No iOS submission API key/,
    );
  }
});

test("fails closed on missing tokens and credential API failures", async () => {
  await assert.rejects(checkIosCredentials([], { token: "" }), /EXPO_TOKEN/);
  await assert.rejects(
    checkIosCredentials([], { fetchImpl: async () => ({ ok: false }) }),
    /Unable to verify/,
  );
  await assert.rejects(
    checkIosCredentials([], {
      fetchImpl: async () => ({
        ok: true,
        json: async () => ({ errors: [{ message: "fixture" }] }),
      }),
    }),
    /EAS rejected/,
  );
});

for (const name of Object.keys(validEnv)) {
  test(`rejects unavailable ${name} even when the runner has a value`, () => {
    const values = { ...validEnv };
    delete values[name];
    const result = validateEnv(values);
    assert.equal(result.status, 1);
    assert.match(result.stderr, new RegExp(name));
  });
}

test("rejects incorrect values without logging their contents", () => {
  for (const [name, value] of [
    ["EXPO_PUBLIC_CONVEX_URL", "https://example.com"],
    [
      "EXPO_PUBLIC_CONVEX_SITE_URL",
      "https://amiable-setter-120.convex.site/wrong",
    ],
    ["EXPO_PUBLIC_REVENUECAT_IOS_KEY", "test_invalid_fixture"],
    ["EXPO_PUBLIC_REVENUECAT_ANDROID_KEY", ""],
    ["APP_VARIANT", "preview"],
  ]) {
    const result = validateEnv({ ...validEnv, [name]: value });
    assert.equal(result.status, 1);
    assert.match(result.stderr, new RegExp(name));
    if (value) assert.ok(!result.stderr.includes(value));
  }
});

const passingRun = {
  head_sha: "selected-sha",
  head_repository: { full_name: "owner/repo" },
  run_number: 10,
  status: "completed",
  conclusion: "success",
};

async function checkCi(runs, payload = {}) {
  const failures = [];
  await verifyCi({
    context: {
      repo: { owner: "owner", repo: "repo" },
      sha: "selected-sha",
      payload,
    },
    core: { setFailed: (message) => failures.push(message) },
    github: {
      rest: { actions: { listWorkflowRuns: "listWorkflowRuns" } },
      paginate: async (method, args) => {
        assert.equal(method, "listWorkflowRuns");
        assert.equal(args.workflow_id, "ci.yml");
        assert.equal(args.head_sha, "selected-sha");
        assert.equal(args.branch, "main");
        assert.equal(args.event, "push");
        return runs;
      },
    },
  });
  return failures;
}

test("accepts successful CI for the exact commit", async () => {
  assert.deepEqual(await checkCi([passingRun]), []);
  assert.deepEqual(
    await checkCi([passingRun], { workflow_run: { head_sha: "selected-sha" } }),
    [],
  );
});

test("rejects missing, failed, pending, wrong-commit and fork CI", async () => {
  for (const runs of [
    [],
    [{ ...passingRun, conclusion: "failure" }],
    [{ ...passingRun, status: "in_progress", conclusion: null }],
    [{ ...passingRun, head_sha: "another-sha" }],
    [{ ...passingRun, head_repository: { full_name: "fork/repo" } }],
    [passingRun, { ...passingRun, run_number: 11, conclusion: "failure" }],
  ]) {
    assert.equal((await checkCi(runs)).length, 1);
  }
});
