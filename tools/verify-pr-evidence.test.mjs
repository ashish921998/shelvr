import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  evidenceProblems,
  hasContent,
  hasVisualEvidence,
  isUiFile,
  section,
  WAIVER_LABEL,
} from "./verify-pr-evidence.mjs";

const template = readFileSync(
  new URL("../.github/pull_request_template.md", import.meta.url),
  "utf8",
);

const SCREEN = "apps/native/src/components/save-card.tsx";
const SHOT = "https://github.com/user-attachments/assets/0b1c2d3e-4f50";

const filled = ({
  evidence = "- CI: https://github.com/o/r/actions/runs/1",
  tail = "",
} = {}) => `## Summary

Before: x. After: y.

## Verification

### What I ran

- \`pnpm --filter native-app check\`: passed

### Evidence

${evidence}

### Not verified

- Real iPhone
${tail}`;

test("the bare template fails on all three subsections", () => {
  const problems = evidenceProblems(template, []);
  assert.equal(problems.length, 3);
  assert.match(problems[0], /What I ran/);
  assert.match(problems[1], /Evidence/);
  assert.match(problems[2], /Not verified/);
});

test("a body with no Verification section fails", () => {
  assert.match(
    evidenceProblems("Fixes the thing.", [])[0],
    /no "## Verification"/,
  );
  assert.equal(evidenceProblems(null, []).length, 1);
});

test("a heading that only starts with the title does not count", () => {
  const body = filled().replace("## Verification", "## Verification pending");
  assert.match(evidenceProblems(body, [])[0], /no "## Verification"/);
});

test("a filled-in backend change passes without screenshots", () => {
  assert.deepEqual(
    evidenceProblems(filled(), ["apps/native/convex/items.ts"]),
    [],
  );
});

test("pasted output in a code fence counts as evidence content", () => {
  const body = filled({ evidence: "```\n# pass 101\n```" });
  assert.deepEqual(evidenceProblems(body, []), []);
});

test("placeholders and nested headings are not content", () => {
  assert.equal(hasContent("- [ ] "), false);
  assert.equal(hasContent("#### TODO"), false);
  assert.equal(hasContent("TBD"), false);
  assert.equal(hasContent("TODO: run checks later"), false);
  assert.equal(hasContent("- **TODO**"), false);
  assert.equal(hasContent("> ### TODO"), false);
  assert.equal(hasContent("- ### TODO"), false);
  assert.equal(hasContent("- [ ] TBD"), false);
  assert.equal(hasContent("Nothing"), true);
  const body = filled({ evidence: "#### TODO" });
  assert.match(evidenceProblems(body, [])[0], /Evidence/);
});

test("a UI change without a screenshot fails and names the files", () => {
  const problems = evidenceProblems(filled(), [SCREEN]);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /save-card\.tsx/);
});

test("a UI change with an uploaded screenshot under Evidence passes", () => {
  const body = filled({ evidence: `<img width="300" src="${SHOT}" />` });
  assert.deepEqual(evidenceProblems(body, [SCREEN]), []);
});

test("a screenshot outside the Evidence section does not count", () => {
  const body = filled({
    tail: `\n## Extra\n\n![badge](https://img.shields.io/x.png)`,
  });
  assert.equal(evidenceProblems(body, [SCREEN]).length, 1);
});

test("the owner's waiver label passes a UI change; a sentence alone does not", () => {
  const body = filled({
    evidence: "No UI change: renames a prop, the screen is identical.",
  });
  assert.equal(evidenceProblems(body, [SCREEN]).length, 1);
  assert.deepEqual(evidenceProblems(body, [SCREEN], [WAIVER_LABEL]), []);
});

test("malformed or non-image links are not visual evidence", () => {
  assert.equal(hasVisualEvidence("![badge](https://x.dev/a.png"), false);
  assert.equal(
    hasVisualEvidence("https://github.com/user-attachments/files/123/log.txt"),
    false,
  );
  assert.equal(hasVisualEvidence("https://x.dev/a.png.exe"), false);
  assert.equal(hasVisualEvidence('<img src="https://x.dev/a.png.exe">'), false);
  assert.equal(
    hasVisualEvidence("  ```\n  ![shot](https://x.dev/a.png)\n  ```"),
    false,
  );
  assert.equal(
    hasVisualEvidence("```\n![shot](https://x.dev/a.png)\n```"),
    false,
  );
  assert.equal(
    hasVisualEvidence("<!-- ![shot](https://x.dev/a.png) -->"),
    false,
  );
  assert.equal(hasVisualEvidence("see https://github.com/o/r/pull/1"), false);
  assert.equal(
    hasVisualEvidence("<!-- hidden\n![shot](https://x.dev/a.png)"),
    false,
  );
  assert.equal(
    hasVisualEvidence("<!<!-- x -->-- ![shot](https://x.dev/a.png) -->"),
    false,
  );
});

test("a shorter fence inside a longer one stays quoted", () => {
  const quoted = "````\n```\n![shot](https://x.dev/a.png)\n````";
  assert.equal(hasVisualEvidence(quoted), false);
  const body = filled({ evidence: quoted });
  assert.equal(evidenceProblems(body, [SCREEN]).length, 1);
  const fakeSections = `## Summary\n\n\`\`\`\`\n\`\`\`\n${filled()}\n\`\`\`\``;
  assert.match(evidenceProblems(fakeSections, [])[0], /no "## Verification"/);
});

test("markdown images, video, and media links count as evidence", () => {
  assert.ok(hasVisualEvidence('[recording](https://x.dev/a.mp4 "demo")'));
  assert.ok(hasVisualEvidence("Home tab: https://x.dev/a.png."));
  assert.ok(hasVisualEvidence("Before https://x.dev/a.png, after."));
  assert.ok(hasVisualEvidence("![home](https://x.dev/a.jpg)"));
  assert.ok(hasVisualEvidence(`![home](${SHOT})`));
  assert.ok(hasVisualEvidence("[recording](https://cdn.example.com/demo.mp4)"));
  assert.ok(hasVisualEvidence('<video src="https://x.dev/v.mp4"></video>'));
  assert.ok(
    hasVisualEvidence(
      "https://raw.githubusercontent.com/o/r/pr-assets/122/home.jpg",
    ),
  );
});

test("which files count as UI", () => {
  for (const path of [
    "apps/native/src/app/(app)/(tabs)/(home)/index.tsx",
    "apps/native/src/unistyles.ts",
    "apps/native/src/lib/motion.ts",
    "apps/native/src/lib/tab-bar-motion.ts",
    "apps/native/src/lib/header-layout.ts",
    "apps/native/src/lib/appearance.ts",
    "apps/native/src/lib/onboarding-labels.ts",
    "apps/native/src/lib/onboarding-demo.ts",
    "apps/native/src/lib/tab-stack-chrome.ts",
    "apps/native/src/components/splash/timeline.ts",
    "apps/web/src/lib/motion.ts",
    "apps/native/src/locales/en.json",
    "apps/native/locales/en.json",
    "apps/native/assets/icon.png",
    "apps/native/app.json",
    "apps/native/app.config.js",
    "apps/native/modules/progressive-blur/ios/ProgressiveBlurView.swift",
    "apps/native/modules/recent-saves-widget/android/src/main/res/values-fr/strings.xml",
    "apps/native/convex/model/notificationTranslations.json",
    "apps/web/src/components/Hero.tsx",
  ]) {
    assert.ok(isUiFile(path), path);
  }
  for (const path of [
    "apps/native/src/components/save-card.test.tsx",
    "apps/native/src/locales/message-types.ts",
    "apps/native/assets/fonts/crimson-pro-license.json",
    "apps/native/src/lib/format.ts",
    "apps/native/convex/items.ts",
    ".github/workflows/ci.yml",
  ]) {
    assert.ok(!isUiFile(path), path);
  }
});

test("a waiver line cannot swallow the next heading", () => {
  const body = filled({ evidence: "No UI change:" });
  // "No UI change:" alone is content-free reasoning but still text; the UI rule
  // is what must hold, and it does not read past the line.
  assert.equal(evidenceProblems(body, [SCREEN]).length, 1);
});

test("a subsection ends at the next heading of its level", () => {
  const body =
    "## Verification\n### What I ran\nran it\n### Not verified\nnothing\n## Other";
  assert.equal(section(body, "What I ran").trim(), "ran it");
  assert.equal(section(body, "not verified:").trim(), "nothing");
  assert.equal(section(body, "Missing"), null);
});
