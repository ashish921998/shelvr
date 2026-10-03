import assert from "node:assert/strict";
import { test } from "node:test";
import {
  hardenActionSource,
  hardenClaudeInstaller,
  hardenGithubMcp,
} from "./harden-review-action.mjs";

const droidSource = `bun install
bun install
curl --retry 5 --retry-delay 2 --retry-all-errors -fsSL https://app.factory.ai/cli | sh
droid plugin marketplace add https://github.com/Factory-AI/factory-plugins 2>/dev/null || true
droid plugin install security-engineer@factory-plugins --scope user 2>/dev/null || {
          echo "Warning: Could not install security-engineer plugin. Security review may have limited functionality."
        }`;

test("Droid cannot use remote installers, mutable marketplace sources, or unverified binaries", () => {
  const result = hardenActionSource("droid", droidSource);
  assert.doesNotMatch(
    result,
    /\| sh\b|marketplace add https:|2>\/dev\/null|bun install\n/,
  );
  assert.equal(result.match(/--frozen-lockfile/g).length, 2);
  assert.match(
    result,
    /factory-cli\/releases\/0\.233\.0\/linux\/x64-baseline\/droid/,
  );
  assert.match(result, /[a-f0-9]{64}.*sha256sum --check --status/);
  assert.ok(result.indexOf("sha256sum") < result.indexOf("chmod +x"));
  assert.match(result, /GITHUB_WORKSPACE.*\.github\/runtime\/factory-plugins/);
});

test("Claude pins both dependencies and native executable without executing a moving installer", () => {
  assert.equal(
    hardenActionSource("claude", "bun install --production\n"),
    "bun install --production --frozen-lockfile\n",
  );
  const result = hardenClaudeInstaller(
    "return `set -o pipefail; curl -fsSL https://claude.ai/install.sh | bash -s -- ${version}`;",
  );
  assert.doesNotMatch(result, /install\.sh|\| bash/);
  assert.match(result, /claude-code-releases\/2\.1\.288\/linux-x64\/claude/);
  assert.match(result, /sha256sum --check --status/);
  assert.match(result, /version !== "2\.1\.288"/);
});

test("the GitHub MCP image is bound to an immutable OCI digest", () => {
  const result = hardenGithubMcp(
    "ghcr.io/github/github-mcp-server:sha-23fa0dd",
  );
  assert.match(
    result,
    /^ghcr.io\/github\/github-mcp-server@sha256:[a-f0-9]{64}$/,
  );
});

test("unreviewed upstream drift fails closed instead of silently skipping a patch", () => {
  assert.throws(
    () =>
      hardenActionSource(
        "droid",
        droidSource.replace("app.factory.ai/cli", "attacker.example/cli"),
      ),
    /upstream action changed/,
  );
  assert.throws(
    () => hardenActionSource("droid", droidSource + "\nbun install\n"),
    /upstream action changed/,
  );
  assert.throws(
    () => hardenActionSource("unknown", droidSource),
    /Unknown review provider/,
  );
  assert.throws(
    () => hardenClaudeInstaller("different installer"),
    /upstream action changed/,
  );
  assert.throws(
    () => hardenGithubMcp("ghcr.io/github/github-mcp-server:latest"),
    /upstream action changed/,
  );
});
