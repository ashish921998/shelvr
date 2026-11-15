import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";

import MarkdownIt from "markdown-it";

import { isMainModule } from "./main-module.mjs";

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

export const WAIVER_LABEL = "no-ui-change";

const OWNER_PATTERNS = [
  /^apps\/native\/convex\/(subscriptions|http|auth|auth\.config|users|freeSaves)\.ts$/,
  /^apps\/native\/convex\/model\/(auth|publicFunctions)\.ts$/,
  /^apps\/native\/src\/lib\/(entitlement|revenuecat-[\w-]+|paywall-[\w-]+|onboarding-paywall|plan-gate|trial-[\w-]+|purchase-[\w-]+|use-restore-purchases|manage-subscription|list-gate)\.ts$/,
  /^apps\/native\/src\/app\/\(app\)\/(paywall|plan-gate)\.tsx$/,
  /^apps\/native\/(eas\.json|app\.json|app\.config\.js|released-builds\.json)$/,
  /^\.github\/(workflows|actions)\//,
  /^\.github\/CODEOWNERS$/,
  /^tools\/verify-pr-evidence\.mjs$/,
];

export const isOwnerFile = (path) => OWNER_PATTERNS.some((re) => re.test(path));

export const DEPENDENCY_BOTS = ["renovate[bot]", "dependabot[bot]"];

const APPROVE = /^\/approve\s+([0-9a-f]{7,40})\b/i;

export function ownerApproved(comments, owner, head) {
  return comments.some((comment) => {
    const named = APPROVE.exec(comment.body?.trim() ?? "")?.[1];
    return (
      comment.user?.login === owner &&
      named !== undefined &&
      head.toLowerCase().startsWith(named.toLowerCase())
    );
  });
}

const markdown = new MarkdownIt({ html: true, linkify: true });

const parse = (body) => markdown.parse(body ?? "", {});

const normalizeTitle = (title) =>
  title
    .trim()
    .replace(/[:\s#]+$/, "")
    .toLowerCase();

const headingLevel = (token) => Number(token.tag.slice(1));

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

const HTML_PIECES =
  /<!--[\s\S]*?(?:-->|$)|<\/?([a-zA-Z][\w-]*)\b(?:"[^"]*"|'[^']*'|[^"'>])*>|[^<]+|</g;

const SOURCE_ATTRIBUTE = { img: "src", video: "src", source: "src", a: "href" };

const attribute = (tag, name) =>
  new RegExp(
    String.raw`\s${name}\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))`,
    "i",
  )
    .exec(tag)
    ?.slice(1)
    .find((value) => value !== undefined);

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

const htmlHasContent = (html) => {
  const { text, sources } = readHtml(html);
  return text.trim().length > 0 || sources.length > 0;
};

const PLACEHOLDER = /^((todo|tbd|tbc|wip)\b.*|pending|n\/?a|-+|\.+)$/i;

const isContentLine = (raw) => {
  const line = raw.replace(/^\s*(\[[ xX]?\])?\s*/, "").trim();
  return line.length > 0 && !PLACEHOLDER.test(line);
};

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
        if (tokens[i - 1]?.type === "heading_open") return false;
        return inlineText(token).split("\n").some(isContentLine);
      default:
        return false;
    }
  });
}

export function hasContent(text) {
  return text !== null && tokensHaveContent(parse(text));
}

const MEDIA_URL =
  /^https:\/\/[^\s)"'<>]+\.(png|jpe?g|gif|webp|mp4|mov|webm)(\?[^\s"'<>]*)?$/i;
const ATTACHMENT_URL =
  /^https:\/\/github\.com\/user-attachments\/assets\/[0-9a-f-]{8,}$/;

const isMediaUrl = (url) => MEDIA_URL.test(url) || ATTACHMENT_URL.test(url);

function* mediaSources(tokens) {
  for (const token of tokens) {
    if (token.type === "html_block") yield* readHtml(token.content).sources;
    if (token.type !== "inline") continue;
    for (const child of token.children) {
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

export function evidenceProblems(
  body,
  changedFiles,
  labels = [],
  { approved = false, author = "" } = {},
) {
  const problems = [];
  const ownerFiles = changedFiles.filter(isOwnerFile);
  if (ownerFiles.length > 0 && !approved) {
    const list = ownerFiles.slice(0, 5).join(", ");
    const more =
      ownerFiles.length > 5 ? ` and ${ownerFiles.length - 5} more` : "";
    problems.push(
      `This pull request changes files only the owner may approve (${list}${more}). ` +
        'Ashish reads the change and comments "/approve <commit>" naming the commit he read; an agent never posts it. ' +
        "A later push needs a new /approve for its commit.",
    );
  }
  if (DEPENDENCY_BOTS.includes(author)) return problems;

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
    if (!tokensHaveContent(sectionTokens(verification, "Review"))) {
      problems.push(
        '"### Review" is empty. Run a REVIEW.md review in a fresh context and give its count line, and what happened to each Important finding.',
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
        `Add one. If nothing a person sees changed, say why in Evidence and add the "${WAIVER_LABEL}" label (gh pr edit --add-label ${WAIVER_LABEL}).`,
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

function prComments() {
  const { GITHUB_REPOSITORY: repo, PR_NUMBER: number } = process.env;
  if (!repo || !number) return [];
  const pages = execFileSync(
    "gh",
    ["api", "--paginate", "--slurp", `repos/${repo}/issues/${number}/comments`],
    { encoding: "utf8" },
  );
  return JSON.parse(pages).flat();
}

function resolve(ref) {
  return execFileSync("git", ["rev-parse", ref], { encoding: "utf8" }).trim();
}

function main() {
  const [base, head = "HEAD"] = process.argv.slice(2);
  if (!base) {
    console.error(
      "usage: verify-pr-evidence.mjs <base-sha> [head-sha]  (PR_BODY, PR_LABELS, PR_AUTHOR, PR_NUMBER, GH_TOKEN in env)",
    );
    process.exit(2);
  }
  const labels = JSON.parse(process.env.PR_LABELS || "[]");
  const problems = evidenceProblems(
    process.env.PR_BODY ?? "",
    changedFilesSince(base, head),
    labels,
    {
      approved: ownerApproved(
        prComments(),
        process.env.GITHUB_REPOSITORY_OWNER ?? "",
        resolve(head),
      ),
      author: process.env.PR_AUTHOR ?? "",
    },
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
