import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  evidenceProblems,
  hasVisualEvidence,
  isUiFile,
  noUiChangeReason,
  section,
} from "./verify-pr-evidence.mjs";

const template = readFileSync(
  new URL("../.github/pull_request_template.md", import.meta.url),
  "utf8",
);

const filled = (extra = "") => `## Summary

Before: x. After: y.

## Verification

### What I ran

- \`pnpm --filter native-app check\`: passed

### Evidence

${extra}

### Not verified

- Real iPhone
`;

test("the bare template fails: its guidance lives in comments", () => {
  const problems = evidenceProblems(template, []);
  assert.equal(problems.length, 2);
  assert.match(problems[0], /What I ran/);
  assert.match(problems[1], /Not verified/);
});

test("a body with no Verification section fails", () => {
  const problems = evidenceProblems("Fixes the thing.", []);
  assert.match(problems[0], /no "## Verification" section/);
});

test("an empty body fails", () => {
  assert.equal(evidenceProblems(null, []).length, 1);
});

test("a filled-in backend change passes without screenshots", () => {
  assert.deepEqual(
    evidenceProblems(filled(), ["apps/native/convex/items.ts"]),
    [],
  );
});

test("an unticked checklist line is not content", () => {
  const body = filled().replace(
    "- `pnpm --filter native-app check`: passed",
    "- [ ] ",
  );
  assert.match(evidenceProblems(body, [])[0], /What I ran/);
});

test("a UI change without a screenshot fails and names the files", () => {
  const problems = evidenceProblems(filled(), [
    "apps/native/src/components/save-card.tsx",
  ]);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /save-card\.tsx/);
});

test("a UI change with an uploaded screenshot passes", () => {
  const body = filled(
    '<img width="300" src="https://github.com/user-attachments/assets/0b1c2d3e" />',
  );
  assert.deepEqual(
    evidenceProblems(body, ["apps/native/src/app/(app)/add.tsx"]),
    [],
  );
});

test("a UI change with a reasoned No UI change line passes", () => {
  const body = filled("No UI change: renames a prop, the screen is identical.");
  assert.deepEqual(
    evidenceProblems(body, ["apps/native/src/components/save-card.tsx"]),
    [],
  );
});

test("a bare No UI change label does not pass", () => {
  assert.equal(noUiChangeReason("No UI change: n/a"), null);
  assert.equal(noUiChangeReason("No UI change:"), null);
});

test("an image inside an HTML comment is not evidence", () => {
  assert.equal(
    hasVisualEvidence("<!-- ![shot](https://x.dev/a.png) -->"),
    false,
  );
});

test("markdown images, video, and media links count as evidence", () => {
  assert.ok(hasVisualEvidence("![home](https://x.dev/a)"));
  assert.ok(hasVisualEvidence('<video src="https://x.dev/v.mp4"></video>'));
  assert.ok(
    hasVisualEvidence(
      "see https://raw.githubusercontent.com/o/r/pr-assets/122/home.jpg",
    ),
  );
  assert.ok(!hasVisualEvidence("see https://github.com/o/r/pull/1"));
});

test("which files count as UI", () => {
  assert.ok(isUiFile("apps/native/src/app/(app)/(tabs)/(home)/index.tsx"));
  assert.ok(isUiFile("apps/native/locales/en.json"));
  assert.ok(isUiFile("apps/native/assets/icon.png"));
  assert.ok(isUiFile("apps/web/src/components/Hero.tsx"));
  assert.ok(!isUiFile("apps/native/src/components/save-card.test.tsx"));
  assert.ok(!isUiFile("apps/native/src/lib/format.ts"));
  assert.ok(!isUiFile("apps/native/convex/items.ts"));
  assert.ok(!isUiFile(".github/workflows/ci.yml"));
});

test("a subsection ends at the next heading of its level", () => {
  const body =
    "## Verification\n### What I ran\nran it\n### Not verified\nnothing\n## Other";
  assert.equal(section(body, "What I ran").trim(), "ran it");
  assert.equal(section(body, "Not verified").trim(), "nothing");
  assert.equal(section(body, "Missing"), null);
});
