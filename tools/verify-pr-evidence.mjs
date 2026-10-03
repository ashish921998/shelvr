import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";

import { isMainModule } from "./main-module.mjs";

/**
 * Files a person sees when they change: screens, components, visible copy,
 * and the images and fonts those draw. A change here needs a screenshot or
 * recording in the pull request, because "the tests pass" says nothing about
 * what the screen looks like.
 */
const UI_PATTERNS = [
  /^apps\/native\/src\/.+\.(tsx|jsx)$/,
  /^apps\/native\/(src\/)?locales\//,
  /^apps\/native\/assets\//,
  /^apps\/web\/src\/.+\.(tsx|jsx|css)$/,
  /^apps\/web\/public\//,
];

const TEST_FILE = /\.test\.(ts|tsx|js|jsx)$/;

export function isUiFile(path) {
  return !TEST_FILE.test(path) && UI_PATTERNS.some((re) => re.test(path));
}

// The template explains each section inside HTML comments. Those comments are
// not evidence, so a body left as the bare template has to read as empty.
const stripComments = (text) => text.replace(/<!--[\s\S]*?-->/g, "");

/**
 * The text under the first heading whose title starts with `title`, up to the
 * next heading of the same or a higher level.
 */
export function section(body, title) {
  const lines = stripComments(body).split(/\r?\n/);
  const want = title.toLowerCase();
  let level = 0;
  const out = [];
  for (const line of lines) {
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (level === 0) {
      if (heading && heading[2].trim().toLowerCase().startsWith(want)) {
        level = heading[1].length;
      }
      continue;
    }
    if (heading && heading[1].length <= level) break;
    out.push(line);
  }
  return level === 0 ? null : out.join("\n");
}

// A section counts as filled in when something other than empty checklist
// boxes, bullets, and whitespace is left in it.
const hasContent = (text) =>
  text !== null &&
  text
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*([-*+]|\d+\.)?\s*(\[[ xX]?\])?\s*/, ""))
    .some((line) => line.trim().length > 0);

/**
 * Whether the body shows the change: an embedded image or video, or a link to
 * one. GitHub's drag-and-drop uploads land on user-attachments URLs that carry
 * no file extension, so those count on their own.
 */
export function hasVisualEvidence(body) {
  const text = stripComments(body);
  return (
    /!\[[^\]]*\]\([^)\s]+/.test(text) ||
    /<(img|video)\b[^>]*\bsrc=/i.test(text) ||
    /https:\/\/github\.com\/user-attachments\/(assets|files)\/\S+/.test(text) ||
    /https?:\/\/\S+\.(png|jpe?g|gif|webp|mp4|mov|webm)(\?\S*)?/i.test(text)
  );
}

/**
 * The reason given on a `No UI change:` line, or null. A bare label with no
 * reason does not count: the point is a sentence a reviewer can disagree with.
 */
export function noUiChangeReason(body) {
  const match = /^[\s>*-]*\**no ui change\**\s*:\**\s*(.+)$/im.exec(
    stripComments(body),
  );
  const reason = match?.[1].trim() ?? "";
  return reason.split(/\s+/).length >= 3 ? reason : null;
}

/**
 * Every reason this pull request body fails the evidence rule, given the files
 * the pull request changes. An empty list means it passes.
 */
export function evidenceProblems(body, changedFiles) {
  const problems = [];
  const text = body ?? "";

  const verification = section(text, "Verification");
  if (verification === null) {
    problems.push(
      'The description has no "## Verification" section. Use the pull request template.',
    );
  } else {
    const ran = section(verification, "What I ran");
    if (!hasContent(ran)) {
      problems.push(
        '"### What I ran" is empty. List the commands, tests, or manual checks that were run, with their results.',
      );
    }
    const notVerified = section(verification, "Not verified");
    if (!hasContent(notVerified)) {
      problems.push(
        '"### Not verified" is empty. Say what was not checked (for example real device, Android, TikTok), or write "Nothing".',
      );
    }
  }

  const uiFiles = changedFiles.filter(isUiFile);
  if (
    uiFiles.length > 0 &&
    !hasVisualEvidence(text) &&
    noUiChangeReason(text) === null
  ) {
    const shown = uiFiles.slice(0, 5).join(", ");
    const more = uiFiles.length > 5 ? ` and ${uiFiles.length - 5} more` : "";
    problems.push(
      `This pull request changes UI files (${shown}${more}) but the description has no screenshot or recording. ` +
        'Add one, or a "No UI change: <reason>" line if nothing a person sees changed.',
    );
  }

  return problems;
}

function changedFilesSince(base) {
  return execFileSync("git", ["diff", "--name-only", `${base}...HEAD`], {
    encoding: "utf8",
  })
    .split("\n")
    .filter(Boolean);
}

function main() {
  const base = process.argv[2];
  if (!base) {
    console.error("usage: verify-pr-evidence.mjs <base-sha>  (PR_BODY in env)");
    process.exit(2);
  }
  const problems = evidenceProblems(
    process.env.PR_BODY ?? "",
    changedFilesSince(base),
  );
  const summary = process.env.GITHUB_STEP_SUMMARY;
  if (problems.length === 0) {
    console.log(
      "The pull request description carries its verification evidence.",
    );
    if (summary)
      appendFileSync(summary, "### Verification evidence: present\n");
    return;
  }
  const report = [
    "### Verification evidence missing",
    "",
    ...problems.map((p) => `- ${p}`),
    "",
    "Edit the pull request description; this check re-runs on every edit.",
  ].join("\n");
  console.error(report);
  if (summary) appendFileSync(summary, `${report}\n`);
  process.exit(1);
}

if (isMainModule(import.meta.url)) main();
