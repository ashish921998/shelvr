# Reviewing a change

Any agent can review a Shelvr change with this file alone: Claude Code, Codex, or a fresh
session. No review bot or subscription is needed. Each checklist line points to where the
rule lives in `CLAUDE.md` or `AGENTS.md`; when they disagree, those files win.

Ask for a review with: "Review this branch against REVIEW.md." The procedure below is the
whole job.

## Who reviews

Review in a fresh context: a subagent, a new session, or another model, never the session
that wrote the code. It carries the author's assumptions. A second model is worth it on a
risky change (see "Always for the owner" below); for Codex use
`codex exec --sandbox read-only --ephemeral` with this file named in the prompt.

## Procedure

1. **Scope.** Review from the fork point, not the tip of main:
   `base=$(git merge-base origin/main HEAD)`, then `git diff $base...HEAD` and
   `git log $base..HEAD`. Read the PR description (`gh pr view`) or the commit messages:
   they say what the change claims to do.
2. **Read the connected code, not just the hunks.** For each changed function, read the
   whole function and grep its callers. For a public Convex function, look for app callers
   in `apps/native/src` and remember installed builds you cannot grep.
3. **Run what is cheap.** Tests next to the changed files
   (`pnpm --filter native-app test <paths>`), and for a Convex change
   `pnpm run verify:convex-api`. Run `pnpm run check:code` only when the change is wide.
   A failure here is a finding.
4. **Hunt in two passes.** First the house rules checklist below. Then ask what breaks:
   an installed app calling the old shape, a deleting account, a retry or a second run, an
   empty or missing value, two writes racing, a user's content leaving the backend, and an
   automatic or AI write landing on something the person typed or chose.
5. **Prove every finding before you report it.** A finding needs one of: a failing test or
   command you ran, or a concrete path from a real input or caller to the wrong result,
   with `file:line` at each step. Two reviewers agreeing is not proof. What you cannot
   prove, drop; if it still worries you, put it under "Could not prove", at most three.
6. **Tag each finding:**
   - **Important:** this change makes something wrong for a person or the business (see
     "What to report"). It blocks the merge.
   - **Nit:** worth a minute, never blocks. At most three a review.
   - **Pre-existing:** `git blame` shows the line is older than `$base`. Report it once,
     never as a reason to block this change.
7. **Report** in the format below, and stop.

## What to report

Report only what would hurt a person using the app or the business:

- a correctness bug on a real path (name the caller or input that reaches it)
- a security or privacy problem
- a broken contract with installed apps, a stuck deploy, or a stranded OTA
- evidence that does not prove what the pull request claims

Skip style, naming, formatting, and "could be cleaner" notes. Name the class of bug once
with every place it occurs, not one finding per line.

## Report format

The first line is the count: `2 Important, 1 Nit, 0 Pre-existing.` or
`Nothing to fix.` Say the second plainly when it is true; an empty review is a good result.

Then each finding:

```
[Important] apps/native/convex/items.ts:812
What fails: <one sentence a person would notice>
How: <the input or caller, and the path to the wrong result>
Proof: <the command and its output, or the file:line chain>
Fix: <the smallest change that removes it>
```

End with "Could not prove" (if any) and "Not checked": what you skipped, such as running
the app, a real device, or production data.

## Rounds

- A re-review reads only the commits since the last reviewed one, and never repeats a
  finding already reported.
- Every Important finding ends fixed, or answered in the PR or a commit with a reason
  ("intended because", "wrong because"). An unanswered one blocks the merge.
- After three rounds that each found something Important, stop reviewing lines and say
  the approach needs rethinking.

## Always for the owner

Paths under `convex/` and `src/` are in `apps/native`. A change that touches any of these
waits for Ashish to read the evidence, whatever the review says. Say so in the report's first
line. The `verification evidence` check enforces it: the PR fails until Ashish adds the
`owner-reviewed` label, and every new push removes the label. An agent never adds it.
The paths are `OWNER_PATTERNS` in `tools/verify-pr-evidence.mjs`:

- billing and entitlement: `convex/subscriptions.ts`, the RevenueCat webhook in
  `convex/http.ts`, `src/lib/entitlement.ts`, paywall code
- auth and accounts: `convex/model/auth.ts`, `convex/model/publicFunctions.ts`,
  `convex/auth.ts`, account deletion in `convex/users.ts`
- release and CI: `.github/workflows/`, `apps/native/eas.json`, `apps/native/app.config.js`,
  `apps/native/app.json`,
  `apps/native/released-builds.json`
- `convex/schema.ts` when a field or table is removed or narrowed (not gated: say so in the
  report)

## After the review

- The same kind of finding twice means the rule should be enforced, not remembered: add a
  lint, type or test and a row in the `AGENTS.md` rules table.
- A bug that shipped past review becomes a case in `tools/review-eval` before this file
  changes, and any change to this file is scored against those cases.

## Shelvr house rules

Backend (`apps/native/convex`):

- [ ] A public query or mutation is built with `authedQuery` / `authedMutation`
      (`model/auth.ts`) and reads `ctx.userId`, or is listed in `PUBLIC_ON_PURPOSE`
      (`model/publicFunctions.ts`). `model/publicFunctions.test.ts` fails an unlisted one,
      and a built one that does not refuse a signed-out or deleting caller before its
      handler runs. A `PUBLIC_ON_PURPOSE` entry's reason is yours to check against its
      handler. A public action still derives the user with
      `requireUserId(ctx)` inside the internal function it runs. No `userId` argument from
      the client. Code that acts for an account checks it is still live (`liveOwner`), not
      mid-deletion.
- [ ] Every Pro feature calls `requireProEntitlement(ctx, userId)`; every new link or note
      save path goes through `createLinkOrNote`, whose `claimSave` counts free saves.
- [ ] Anything that sends user content to Gemini, SerpAPI or Treg checks AI
      eligibility first (`aiAllowed` in `aiConsent.ts`, `internal.aiConsent.isAllowed`
      from actions): live ownership and legacy opt-outs remain enforced. New accounts
      default to AI enabled; do not describe this as collected consent.
- [ ] Public `args` / `returns` shapes are unchanged, or the change is expand-first with a
      `Convex-Api: changed` trailer. Validators match what the function really returns.
- [ ] AI passes only create or remove `suggested` memberships. Documented exceptions: the
      classifier inserts new matches as `saved` in a space set to auto-file, and
      `steerItemForSpace` may update `intents` on `saved` rows. No AI pass ever overwrites a
      `saved` or `dismissed` decision.
- [ ] A new table field is a one-way door: rolling back means leaving it `v.optional`.
- [ ] Reads on growing tables use an index, not `.filter()`.
- [ ] Logging goes through `logEvent` with scalar fields only: no messages, URLs, user
      content, tokens or secrets.
- [ ] Every external fetch goes through `safeFetch`.
- [ ] Tests build the harness with `newConvexTest()`.

Native app (`apps/native/src`):

- [ ] New visible copy is in every locale catalog, with generated files regenerated, not
      hand-edited.
- [ ] A change to a native module, a config plugin, `app.json` or `app.config.js` may move
      the fingerprint. CI's `native fingerprint` job reports it: when it says CHANGED, the
      PR needs the `Native-Fingerprint: changed` trailer and a store build. The job checks
      the production variant only, never blocks, and cannot see `eas.json` build fields,
      `.easignore` edits or pnpm patches, so decide those by hand
      ([what the fingerprint hashes](docs/architecture/push-notifications.md#what-the-fingerprint-hashes)).
- [ ] No test file under `src/app`.
- [ ] Handled failures report through `analytics.captureError`.

## Evidence

The PR evidence check only confirms that the Verification section's three subsections
(What I ran, Evidence, Not verified) are filled in, and that UI changes carry a screenshot
or recording unless the `no-ui-change` label is set. The reviewer checks that they are
right:

- [ ] The evidence was taken on the current head commit, or on one whose later commits
      cannot change what it shows.
- [ ] The result shown is the result claimed (a passing run, the screen described).
- [ ] "Not verified" names what was skipped, and nothing risky hides there.
- [ ] A change to a flow covered by `tools/e2e` says whether that flow was run.
