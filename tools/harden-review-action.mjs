import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { isMainModule } from "./main-module.mjs";

const droidUrl =
  "https://downloads.factory.ai/factory-cli/releases/0.233.0/linux/x64-baseline/droid";
const droidChecksum =
  "824b15b892316e5e6714b8b675166278944105fd1b2959e6398d3c203a4125ac";
const claudeUrl =
  "https://downloads.claude.ai/claude-code-releases/2.1.288/linux-x64/claude";
const claudeChecksum =
  "0298068b686e7fdbaf9402a7a587bb7f49c0b0e084de09f69145a0719207640c";
const githubMcpDigest =
  "ghcr.io/github/github-mcp-server@sha256:6727a2e0306cec549d15be51c6b89dd967cb25750596c7154fb2c8f0c3943960";

function replaceExact(source, before, after, count = 1) {
  if (source.split(before).length - 1 !== count) {
    throw new Error(
      "Pinned upstream action changed; review its executable dependencies before updating.",
    );
  }
  return source.replaceAll(before, after);
}

/** Download a fixed artifact and check the repository-held digest before
 * execution. No moving installer script or remotely supplied checksum runs. */
function installBinary(url, checksum, name) {
  return `mkdir -p "$HOME/.local/bin"; curl --retry 5 --retry-delay 2 --retry-all-errors -fsSL '${url}' -o "$HOME/.local/bin/${name}"; echo '${checksum}'\"  $HOME/.local/bin/${name}\" | sha256sum --check --status; chmod +x "$HOME/.local/bin/${name}"`;
}

export function hardenActionSource(provider, source) {
  if (provider === "droid") {
    let result = replaceExact(
      source,
      "bun install\n",
      "bun install --frozen-lockfile\n",
      2,
    );
    result = replaceExact(
      result,
      "curl --retry 5 --retry-delay 2 --retry-all-errors -fsSL https://app.factory.ai/cli | sh",
      installBinary(droidUrl, droidChecksum, "droid"),
    );
    result = replaceExact(
      result,
      "droid plugin marketplace add https://github.com/Factory-AI/factory-plugins 2>/dev/null || true",
      'droid plugin marketplace add "${GITHUB_WORKSPACE}/.github/runtime/factory-plugins"',
    );
    return replaceExact(
      result,
      `droid plugin install security-engineer@factory-plugins --scope user 2>/dev/null || {
          echo "Warning: Could not install security-engineer plugin. Security review may have limited functionality."
        }`,
      "droid plugin install security-engineer@factory-plugins --scope user",
    );
  }
  if (provider === "claude") {
    return replaceExact(
      source,
      "bun install --production\n",
      "bun install --production --frozen-lockfile\n",
    );
  }
  throw new Error("Unknown review provider");
}

export function hardenClaudeInstaller(source) {
  const installer = installBinary(claudeUrl, claudeChecksum, "claude");
  return replaceExact(
    source,
    "return `set -o pipefail; curl -fsSL https://claude.ai/install.sh | bash -s -- ${version}`;",
    `if (version !== "2.1.288") throw new Error("Review the new Claude artifact and checksum first");\n  return ${JSON.stringify(`set -euo pipefail; ${installer}`)};`,
  );
}

export function hardenGithubMcp(source) {
  return replaceExact(
    source,
    "ghcr.io/github/github-mcp-server:sha-23fa0dd",
    githubMcpDigest,
  );
}

if (isMainModule(import.meta.url)) {
  const [provider, root] = process.argv.slice(2);
  const action = join(root, "action.yml");
  const hardened = hardenActionSource(provider, readFileSync(action, "utf8"));
  const extra =
    provider === "claude"
      ? "src/entrypoints/run.ts"
      : "src/mcp/install-mcp-server.ts";
  const extraPath = join(root, extra);
  const transform =
    provider === "claude" ? hardenClaudeInstaller : hardenGithubMcp;
  const hardenedExtra = transform(readFileSync(extraPath, "utf8"));
  writeFileSync(action, hardened);
  writeFileSync(extraPath, hardenedExtra);
}
