---
name: qa
description: >
  Run QA tests for Shelvr. Analyzes the git diff to determine affected areas,
  runs configured test flows for the Convex backend (curl) and the Expo
  native app (iOS simulator, local-only) with the anonymous dev persona,
  and generates diff-targeted functional tests plus a standardized report.
  Use when testing PRs, releases, or smoke testing environments.
---

# QA Orchestrator

**SCOPE: This skill performs manual/functional QA only — verifying that the
application actually works by interacting with it as a real user would (curl
against HTTP endpoints, driving the app on the iOS simulator). Do NOT run or
report on CI checks, linting, ESLint, typecheck, unit tests, or any static
analysis. Those are handled by separate workflows.**

## Step 1: Load Configuration

Read `.factory/skills/qa/config.yaml` for environment URLs, restrictions,
personas, and app definitions. It is the single source of truth.

Driver routing for this project:

- `qa-backend` flows run over plain `curl` (+ `jq`) against the Convex site
  URLs. No interactive driver is involved.
- `qa-native` flows drive the Expo app on an iOS simulator through the argent
  session tools (`argent___list-devices`, `argent___boot-device`,
  `argent___launch-app`, `argent___gesture-tap`, `argent___keyboard`,
  `argent___paste`, `argent___screenshot`, `argent___screen-recording-start` /
  `-stop`, `argent___await-ui-element`, `argent___native-describe-screen`, and
  siblings). These tools exist only in interactive Factory sessions; mobile QA
  is local-only by design.
- droid-control browser/terminal/desktop routes do not apply to any in-scope
  app. Do not invoke the droid-control skill for QA of this project.

Read `video_evidence` and `droid_control.compose` from config on every run;
never cache a previous run's values. When both are true, run the droid-control
Compose stage on droid-control captures and pass the literal `"preset":
"factory"` on every render. When `droid_control.compose` is false, never invoke
Compose and never install its prerequisites. Simulator recordings from the
argent tools are not droid-control captures and never go through Compose.

## Step 2: Determine Target Environment

- Backend flows default to the **production** environment (read-only: health
  probe + negative auth tests), then repeat negative flows against
  **development** where the sub-skill says so. Positive waitlist flows run
  against development only.
- Native flows always run against the **development** environment (the dev
  build's `app.config.js` rejects the production Convex URL by design).
- Respect every `restrictions` entry for the chosen environment. Production is
  read-only, period.
- There are no Vercel/Netlify preview deployments in scope (web marketing QA is
  intentionally excluded). If a URL other than the two in config.yaml is
  requested, stop and confirm before testing against it.

## Step 3: Analyze Git Diff

Run `git diff` (against the base branch for PRs — `origin/main` — or `HEAD^`
for post-merge runs) and map changed files to apps using `path_patterns` in
config.yaml.

- Files matching an app's patterns make that app **affected**.
- Files matching no app's patterns (`.factory/**`, `docs/**`, `.github/**`,
  root config, `apps/web/**`) are NOT associated with any app. Do NOT run app
  flows for them.
- `apps/web/**` is out of scope **by explicit user configuration** (web
  marketing QA was excluded). A web-only diff means no in-scope app code
  changed.
- Shared files (`package.json`, `pnpm-lock.yaml`) affect both apps.

For each affected app:

- Run ONLY that app's flows from its sub-skill menu.
- Generate ADDITIONAL targeted tests based on the specific changes in the diff.

For apps NOT affected by the diff: do NOT load or run their sub-skill, flows,
or pre-flight checks. The diff determines scope, period.

If NO app is affected (docs-only, CI-only, web-only, or config-only changes),
report INCONCLUSIVE: "No in-scope app code changed — QA not applicable for
this diff." Do NOT run any app flows.

## Step 4: Pre-flight Checks (affected apps only)

- `qa-backend` affected: confirm `curl` and `jq` exist; confirm the target
  site URLs resolve (one cheap `GET /health` or equivalent). If
  `QA_WAITLIST_SHARED_SECRET` is unset in the environment, the secret-gated
  dev flows report BLOCKED — negative and health flows still run.
- `qa-native` affected: confirm macOS/Xcode + a booted simulator + the dev
  client build exist (see the sub-skill's pre-flight). If the argent session
  tools are unavailable — e.g. running under `droid exec` in CI — report the
  native app as BLOCKED with the reason "mobile QA is local-only"; do NOT
  attempt simulator flows in CI.
- When Compose is enabled in config, install its prerequisites only at that
  moment; when it is disabled, never install Compose/Remotion prerequisites.

If a pre-flight check fails for an affected app, report that app as BLOCKED
with the specific error and remediation — but still proceed with other
affected apps.

## Step 5: Execute Diff-Relevant Flows Only

For each affected app, read its sub-skill at
`.factory/skills/qa-<app-name>/SKILL.md`. The sub-skill contains a MENU of
flows. You must:

1. Read the diff and pick the flows relevant to the change.
2. Run those flows PLUS adjacent flows that verify the change integrates
   correctly (e.g., a changed `items.ts` query → item detail renders and search
   still finds the item).
3. Do NOT run completely unrelated flows.
4. If no existing flow covers the change, write a NEW ad-hoc test that
   directly verifies the changed behavior.
5. Do NOT run unit tests, lint, typecheck, or any automated suite. This is
   functional QA only.

## Step 6: Evidence Capture

After each significant step, capture evidence. Text snapshots are primary
evidence — they render inline in the PR comment.

- Backend (curl): embed the trimmed request line, status, and response body
  as a labeled fenced code block. Trim to the meaningful part.
- Native (argent tools): capture the screen's element tree via
  `argent___native-describe-screen` (or `describe`) after each meaningful UI
  state change, embed trimmed text snapshots, and save screenshots via
  `argent___screenshot` to `./qa-results/$RUN_ID/`.
- When `video_evidence: true`, record exactly ONE video per flow (not one per
  run) using `argent___screen-recording-start` / `screen-recording-stop`, saved
  under `./qa-results/$RUN_ID/<flow-slug>.mp4`. Verify each file exists and is
  non-empty; retry the recording once if it fails, else fall back to text +
  screenshots. When `video_evidence: false`, skip recording entirely.
- Mobile runs are local-only: recordings and screenshots stay as local
  artifacts under `qa-results/`. Reference filenames in the report; never
  embed `![image](path)` markdown for local paths in CI-facing reports.
- In CI (backend-only), no media exists: text evidence only, and the workflow
  uploads `qa-results/` as a downloadable artifact.

Evidence quality rules: every snapshot must show something DIFFERENT (wait for
the UI/state to change before capturing again), label each snapshot with what
it shows and why it matters, and never embed a link or image you have not
verified resolves.

## Step 7: Test Quality Gate

1. CHANGE-SPECIFIC FIRST. At least half your tests directly verify the
   behavioral change in the diff.
2. INTEGRATION TESTS ARE VALID (the change integrates with existing
   features). They are not smoke tests.
3. NO UNRELATED FLOWS.
4. NO AUTOMATED TEST SUITES.
5. NEGATIVE TESTS: include at least 1 test verifying error handling or
   boundary conditions related to the change.
6. INTERACTIVE TESTING: act like a real user.
7. INCONCLUSIVE IF UNSURE: if you cannot articulate what the diff changes,
   report INCONCLUSIVE rather than PASS.

## Step 8: Handle Failures

**Never silently skip a flow.** If a flow cannot complete, report it as
BLOCKED with what was tried and how the user can fix it. Then continue to the
next flow — never abort the entire run for a single failure. A flow that
misbehaves (wrong UI, wrong status, missing data) is FAIL, not BLOCKED.

## Step 9: Generate Report

Write the report to `./qa-results/report.md` using
`.factory/skills/qa/REPORT-TEMPLATE.md`. Key rules:

- Start with `## QA Report` followed by the results table.
- Result column uses emojis: :white_check_mark: PASS, :x: FAIL, :no_entry:
  BLOCKED, :warning: FLAKY, :grey_question: INCONCLUSIVE.
- Keep it concise: table + short "Action Required" (if any) + one collapsed
  evidence block.
- Do NOT report setup/pre-flight steps (building, launching, Metro) as test
  rows. Only rows that verify user-facing behavior count.
- All evidence goes in the single collapsed `<details>` block.

## Step 10: Suggest Skill Updates (Failure Learning)

After the report, check whether any BLOCKED or FAIL result revealed a
**testing-environment insight** that would help future runs (how the
environment works — not selector typos or expected diff-induced UI changes).
Read `failure_learning` from config.yaml: it is `suggest_in_report`, so
include the table in the report only and do NOT write
`qa-results/skill-updates.json`.

Format:

```markdown
## Suggested Skill Updates (N issues found)

| #   | Severity              | File                                 | Issue   | Fix Prompt                                                                    |
| --- | --------------------- | ------------------------------------ | ------- | ----------------------------------------------------------------------------- |
| 1   | :red_circle: Breaking | `.factory/skills/qa-native/SKILL.md` | <short> | <details><summary>Copy</summary><br>`<self-contained droid prompt>`</details> |
```

Severity: :red_circle: Breaking (fails every run), :large_yellow_circle:
Degraded (intermittent), :large_blue_circle: Info (new knowledge). Do NOT
suggest updates for failures already covered in a sub-skill's Known Failure
Modes, bad selectors, or expected behavior changes from the PR. If nothing
genuinely new was found, omit the section entirely.
