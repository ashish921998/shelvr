import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";

import { isMainModule } from "./main-module.mjs";

/**
 * Files a person sees when they change: screens, components, styling and
 * motion, visible copy (app, widget, and push notification text), images,
 * native view modules, and the app config. A change here needs a screenshot or
 * recording in the pull request, because "the tests pass" says nothing about
 * what the screen looks like.
 *
 * Out of reach of any pattern: the paywall, which RevenueCat's dashboard
 * controls. A paywall change still owes a screenshot under the rule in
 * CLAUDE.md; this check cannot see it.
 */
const UI_PATTERNS = [
  /^apps\/native\/src\/.+\.(tsx|jsx)$/,
  /^apps\/native\/src\/(components|widgets)\/.+\.ts$/,
  /^apps\/native\/src\/unistyles\.ts$/,
  /^apps\/native\/src\/lib\/(appearance|appearance-runtime|color|header-layout|motion|tab-bar-motion)\.ts$/,
  /^apps\/native\/src\/locales\/.+\.json$/,
  /^apps\/native\/locales\//,
  /^apps\/native\/assets\//,
  /^apps\/native\/modules\//,
  /^apps\/native\/app-intents\//,
  /^apps\/native\/app\.(json|config\.js)$/,
  /^apps\/native\/convex\/model\/notificationTranslations\.json$/,
  /^apps\/web\/src\/.+\.(tsx|jsx|css)$/,
  /^apps\/web\/src\/lib\/motion\.ts$/,
  /^apps\/web\/public\//,
];

const NOT_UI = [/\.test\.(ts|tsx|js|jsx)$/, /license[^/]*$/i];

export function isUiFile(path) {
  return (
    !NOT_UI.some((re) => re.test(path)) &&
    UI_PATTERNS.some((re) => re.test(path))
  );
}

/** The label only the repository owner adds to waive the screenshot. */
export const WAIVER_LABEL = "no-ui-change";

// The template explains each section inside HTML comments. Those comments are
// not evidence, so a body left as the bare template has to read as empty.
const stripComments = (text) => text.replace(/<!--[\s\S]*?-->/g, "");

// Pasted output in a code fence is evidence that something ran, but an image
// tag quoted inside one shows nothing.
const stripFences = (text) =>
  text.replace(/^[ \t]*(```|~~~)[\s\S]*?^[ \t]*\1/gm, "");

// A line opening or closing a code fence; a heading inside one is quoted text.
const FENCE = /^[ \t]*(```|~~~)/;

const normalizeTitle = (title) =>
  title
    .trim()
    .replace(/[:\s#]+$/, "")
    .toLowerCase();

/**
 * The text under the heading titled exactly `title` (case-insensitive, a
 * trailing colon allowed), up to the next heading of the same or a higher
 * level. Null when there is no such heading.
 */
export function section(body, title) {
  const lines = stripComments(body).split(/\r?\n/);
  const want = normalizeTitle(title);
  let level = 0;
  const out = [];
  let fenced = false;
  for (const line of lines) {
    if (FENCE.test(line)) fenced = !fenced;
    const heading = fenced ? null : /^(#{1,6})[ \t]+(.*)$/.exec(line);
    if (level === 0) {
      if (heading && normalizeTitle(heading[2]) === want) {
        level = heading[1].length;
      }
      continue;
    }
    if (heading && heading[1].length <= level) break;
    out.push(line);
  }
  return level === 0 ? null : out.join("\n");
}

// A line that only restates the template's shape, or promises content later,
// is not content: empty bullets and boxes, nested headings, placeholders.
const PLACEHOLDER = /^((todo|tbd|tbc|wip)\b.*|pending|n\/?a|-+|\.+)$/i;

export function hasContent(text) {
  if (text === null) return false;
  let fenced = false;
  return text.split(/\r?\n/).some((raw) => {
    if (FENCE.test(raw)) {
      fenced = !fenced;
      return false;
    }
    if (fenced) return raw.trim().length > 0;
    if (/^[ \t]*#{1,6}[ \t]/.test(raw)) return false;
    const line = raw
      .replace(/^\s*([-*+>]|\d+\.)?\s*(\[[ xX]?\])?\s*/, "")
      .replace(/[*_`]/g, "")
      .trim();
    return line.length > 0 && !PLACEHOLDER.test(line);
  });
}

const MEDIA_URL = String.raw`https:\/\/[^\s)"'<>]+\.(png|jpe?g|gif|webp|mp4|mov|webm)(\?[^\s)"'<>]*)?`;
const ATTACHMENT_URL = String.raw`https:\/\/github\.com\/user-attachments\/assets\/[0-9a-f-]{8,}`;
const IMAGE_URL = `(${MEDIA_URL}|${ATTACHMENT_URL})`;

/**
 * Whether `text` shows the change: an embedded image or video, or a bare link
 * to one. GitHub's drag-and-drop uploads land on user-attachments asset URLs
 * that carry no file extension, so those count on their own; its `files`
 * attachments (logs, archives) do not.
 */
export function hasVisualEvidence(text) {
  const clean = stripFences(stripComments(text));
  // An embed, or a plain link to a recording: both open the media.
  const markdown = new RegExp(String.raw`!?\[[^\]]*\]\(\s*${IMAGE_URL}\s*\)`);
  const tag = new RegExp(
    String.raw`<(img|video|source)\b[^>]*\bsrc=["']?${IMAGE_URL}(?=["'\s>/])`,
    "i",
  );
  const bare = new RegExp(String.raw`(^|\s)${IMAGE_URL}(?=\s|$)`, "m");
  return markdown.test(clean) || tag.test(clean) || bare.test(clean);
}

/**
 * Every reason this pull request fails the evidence rule, given its body, the
 * files it changes, and its labels. An empty list means it passes.
 */
export function evidenceProblems(body, changedFiles, labels = []) {
  const problems = [];
  const text = body ?? "";

  const verification = section(text, "Verification");
  const evidence =
    verification === null ? null : section(verification, "Evidence");
  if (verification === null) {
    problems.push(
      'The description has no "## Verification" section. Use the pull request template.',
    );
  } else {
    if (!hasContent(section(verification, "What I ran"))) {
      problems.push(
        '"### What I ran" is empty. List the commands, tests, or manual checks that were run, with their results.',
      );
    }
    if (!hasContent(evidence)) {
      problems.push(
        '"### Evidence" is empty. Link the CI run, paste the output, or add screenshots.',
      );
    }
    if (!hasContent(section(verification, "Not verified"))) {
      problems.push(
        '"### Not verified" is empty. Say what was not checked (for example real device, Android, TikTok), or write "Nothing".',
      );
    }
  }

  const uiFiles = changedFiles.filter(isUiFile);
  const shown = evidence !== null && hasVisualEvidence(evidence);
  if (uiFiles.length > 0 && !shown && !labels.includes(WAIVER_LABEL)) {
    const list = uiFiles.slice(0, 5).join(", ");
    const more = uiFiles.length > 5 ? ` and ${uiFiles.length - 5} more` : "";
    problems.push(
      `This pull request changes UI files (${list}${more}) but "### Evidence" has no screenshot or recording. ` +
        `Add one. If nothing a person sees changed, say why in Evidence and ask the owner to add the "${WAIVER_LABEL}" label.`,
    );
  }

  return problems;
}

function changedFilesSince(base, head) {
  return execFileSync("git", ["diff", "--name-only", `${base}...${head}`], {
    encoding: "utf8",
  })
    .split("\n")
    .filter(Boolean);
}

function main() {
  const [base, head = "HEAD"] = process.argv.slice(2);
  if (!base) {
    console.error(
      "usage: verify-pr-evidence.mjs <base-sha> [head-sha]  (PR_BODY, PR_LABELS in env)",
    );
    process.exit(2);
  }
  const labels = JSON.parse(process.env.PR_LABELS || "[]");
  const problems = evidenceProblems(
    process.env.PR_BODY ?? "",
    changedFilesSince(base, head),
    labels,
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
