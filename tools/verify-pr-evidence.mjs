import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";

import MarkdownIt from "markdown-it";

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
  /^apps\/native\/src\/lib\/(appearance|appearance-runtime|color|header-layout|motion|tab-bar-motion|onboarding-labels|onboarding-demo|tab-stack-chrome)\.ts$/,
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

// One CommonMark parse decides what the description renders as, the way
// GitHub does: a fence, an indented code block, a quoted fence, or an HTML
// comment is one node, and whatever it holds is never read as a heading,
// content, or media.
const markdown = new MarkdownIt({ html: true, linkify: true });

const parse = (body) => markdown.parse(body ?? "", {});

const normalizeTitle = (title) =>
  title
    .trim()
    .replace(/[:\s#]+$/, "")
    .toLowerCase();

const headingLevel = (token) => Number(token.tag.slice(1));

/**
 * The tokens under the top-level heading titled exactly `title`
 * (case-insensitive, a trailing colon allowed), up to the next top-level
 * heading of the same or a higher level. Null when there is no such heading.
 * A heading inside a list or quote is part of the content, not a boundary.
 */
function sectionTokens(tokens, title) {
  const want = normalizeTitle(title);
  const start = tokens.findIndex(
    (t, i) =>
      t.type === "heading_open" &&
      t.level === 0 &&
      normalizeTitle(tokens[i + 1].content) === want,
  );
  if (start === -1) return null;
  const level = headingLevel(tokens[start]);
  let end = start + 3;
  while (
    end < tokens.length &&
    !(
      tokens[end].type === "heading_open" &&
      tokens[end].level === 0 &&
      headingLevel(tokens[end]) <= level
    )
  ) {
    end++;
  }
  return tokens.slice(start + 3, end);
}

/** The source text of section `title` in `body`, or null. */
export function section(body, title) {
  const tokens = sectionTokens(parse(body), title);
  if (tokens === null) return null;
  const lines = (body ?? "").split(/\r?\n/);
  const mapped = tokens.filter((t) => t.map);
  if (mapped.length === 0) return "";
  return lines
    .slice(mapped[0].map[0], mapped[mapped.length - 1].map[1])
    .join("\n");
}

// Raw HTML, read left to right: a comment runs to its "-->" (or, as on
// GitHub, to the end), so a tag inside one is never seen. Markup itself is
// not text; only what lies between tags is.
const HTML_PIECES =
  /<!--[\s\S]*?(?:-->|$)|<\/?([a-zA-Z][\w-]*)\b[^>]*>|[^<]+|</g;

// The attribute that opens each tag's target: media embeds and links.
const SOURCE_ATTRIBUTE = { img: "src", video: "src", source: "src", a: "href" };

const attribute = (tag, name) =>
  new RegExp(
    String.raw`\s${name}\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))`,
    "i",
  )
    .exec(tag)
    ?.slice(1)
    .find((value) => value !== undefined);

/**
 * What raw HTML shows: its text outside comments and tags, and the targets
 * its media embeds and links open.
 */
function readHtml(html) {
  let text = "";
  const sources = [];
  for (const [piece, name] of html.matchAll(HTML_PIECES)) {
    if (piece.startsWith("<!--")) continue;
    if (name === undefined) {
      text += piece;
      continue;
    }
    const target = SOURCE_ATTRIBUTE[name.toLowerCase()];
    const value = target && attribute(piece, target);
    if (value) sources.push(value);
  }
  return { text, sources };
}

/** Whether raw HTML shows anything: text, an embed, or a link. */
const htmlHasContent = (html) => {
  const { text, sources } = readHtml(html);
  return text.trim().length > 0 || sources.length > 0;
};

// A line that only restates the template's shape, or promises content later,
// is not content: empty bullets and boxes, nested headings, placeholders.
const PLACEHOLDER = /^((todo|tbd|tbc|wip)\b.*|pending|n\/?a|-+|\.+)$/i;

const isContentLine = (raw) => {
  const line = raw.replace(/^\s*(\[[ xX]?\])?\s*/, "").trim();
  return line.length > 0 && !PLACEHOLDER.test(line);
};

/** The visible text of an inline token; an embedded image counts as text. */
function inlineText(token) {
  return token.children
    .map((child) => {
      switch (child.type) {
        case "text":
        case "code_inline":
          return child.content;
        case "softbreak":
        case "hardbreak":
          return "\n";
        case "image":
          return "[image]";
        case "html_inline":
          return htmlHasContent(child.content) ? "[html]" : "";
        default:
          return "";
      }
    })
    .join("");
}

function tokensHaveContent(tokens) {
  if (tokens === null) return false;
  return tokens.some((token, i) => {
    switch (token.type) {
      case "fence":
      case "code_block":
        return token.content.trim().length > 0;
      case "html_block":
        return htmlHasContent(token.content);
      case "inline":
        // A heading is not content, even inside a list or quote.
        if (tokens[i - 1]?.type === "heading_open") return false;
        return inlineText(token).split("\n").some(isContentLine);
      default:
        return false;
    }
  });
}

/** Whether `text` holds anything beyond template shape and placeholders. */
export function hasContent(text) {
  return text !== null && tokensHaveContent(parse(text));
}

const MEDIA_URL =
  /^https:\/\/[^\s)"'<>]+\.(png|jpe?g|gif|webp|mp4|mov|webm)(\?[^\s"'<>]*)?$/i;
const ATTACHMENT_URL =
  /^https:\/\/github\.com\/user-attachments\/assets\/[0-9a-f-]{8,}$/;

const isMediaUrl = (url) => MEDIA_URL.test(url) || ATTACHMENT_URL.test(url);

/** Every URL a reader can open as media from these tokens. */
function* mediaSources(tokens) {
  for (const token of tokens) {
    if (token.type === "html_block") yield* readHtml(token.content).sources;
    if (token.type !== "inline") continue;
    for (const child of token.children) {
      // An embed, or a link (written or bare) to a recording: both open it.
      if (child.type === "image") yield child.attrGet("src");
      if (child.type === "link_open") yield child.attrGet("href");
      if (child.type === "html_inline") {
        yield* readHtml(child.content).sources;
      }
    }
  }
}

/**
 * Whether these tokens show the change: an embedded image or video, or a link
 * to one. GitHub's drag-and-drop uploads land on user-attachments asset URLs
 * that carry no file extension, so those count on their own; its `files`
 * attachments (logs, archives) do not.
 */
const tokensShowMedia = (tokens) =>
  [...mediaSources(tokens)].some((url) => url && isMediaUrl(url));

export function hasVisualEvidence(text) {
  return tokensShowMedia(parse(text));
}

/**
 * Every reason this pull request fails the evidence rule, given its body, the
 * files it changes, and its labels. An empty list means it passes.
 */
export function evidenceProblems(body, changedFiles, labels = []) {
  const problems = [];
  const tokens = parse(body);

  const verification = sectionTokens(tokens, "Verification");
  const evidence =
    verification === null ? null : sectionTokens(verification, "Evidence");
  if (verification === null) {
    problems.push(
      'The description has no "## Verification" section. Use the pull request template.',
    );
  } else {
    if (!tokensHaveContent(sectionTokens(verification, "What I ran"))) {
      problems.push(
        '"### What I ran" is empty. List the commands, tests, or manual checks that were run, with their results.',
      );
    }
    if (!tokensHaveContent(evidence)) {
      problems.push(
        '"### Evidence" is empty. Link the CI run, paste the output, or add screenshots.',
      );
    }
    if (!tokensHaveContent(sectionTokens(verification, "Not verified"))) {
      problems.push(
        '"### Not verified" is empty. Say what was not checked (for example real device, Android, TikTok), or write "Nothing".',
      );
    }
  }

  const uiFiles = changedFiles.filter(isUiFile);
  const shown = evidence !== null && tokensShowMedia(evidence);
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
