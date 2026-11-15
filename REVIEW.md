# Reviewing a change

Any agent can review a Shelvr change with this file alone. Ask: "Review this branch
against REVIEW.md."

**The job in five lines:**

1. Review in a fresh context, never the session that wrote the code.
2. Read the diff from the fork point, and the code that calls it.
3. Look for what would hurt a person or the business, nothing else.
4. Prove every finding with a failing command or a `file:line` path.
5. Report the count first, then each finding. Then stop.

`CLAUDE.md` and `AGENTS.md` hold the rules this file checks. When they disagree, they win.

## Who reviews

A subagent, a new session or another model: anything that did not write the code. On a
risky change, also ask Codex: `codex exec --sandbox read-only --ephemeral`, naming this
file in the prompt.

## Steps

1. **Scope.** `base=$(git merge-base origin/main HEAD)`, then read `git diff $base...HEAD`,
   `git log $base..HEAD` and the PR description. They say what the change claims to do.
2. **Read around the diff.** The whole of each changed function, and its callers. A public
   Convex function also has callers you cannot grep: app builds already installed.
3. **Run the cheap checks.** `pnpm --filter native-app test <changed test files>`, and
   `pnpm run verify:convex-api` for a Convex change. A failure is a finding.
4. **Hunt.** Go through the house rules below. Then ask the four questions this app
   gets wrong most often:
   - Does an installed app still work against the new backend?
   - What happens on a retry, a second run, or two writes at once?
   - Can an automatic or AI write overwrite something the person chose?
   - Does a person's content, or a deleting account's data, go where it should not?

   When the change touches a flow with steps that can happen in any order (onboarding and
   the paywall, a save being processed and edited, push devices across accounts, account
   deletion, reminders, shared lists), model it with the `pstack:statechart` skill. Write
   rules about what the person sees, what they chose, and what gets recorded, such as "a
   person is never charged twice" or "a choice the person takes back is undone".
   Confirm each broken rule against the code before reporting it.

5. **Prove it.** Each finding needs a test or command you ran that fails, or a path from a
   real input to the wrong result with `file:line` at each step. Two reviewers agreeing is
   not proof. Drop what you cannot prove, or list up to three under "Could not prove".
6. **Tag it.**
   - **Important:** this change breaks something for a person or the business. Blocks
     the merge.
   - **Nit:** worth a minute. Never blocks. At most three.
   - **Pre-existing:** `git blame` says the line is older than `$base`. Report once,
     never block.

What counts as Important: a bug on a real path, a security or privacy problem, a break
for installed apps, a stuck deploy or stranded OTA, or evidence that does not show what
the PR claims. Style, naming and "could be cleaner" are not findings. Report a repeated
bug once, with every place it occurs.

## Report

First line: `2 Important, 1 Nit, 0 Pre-existing.` or `Nothing to fix.` An empty review
is a good result; say it plainly.

Then each finding:

```
[Important] apps/native/convex/items.ts:812
What fails: <what a person would notice>
How: <the input or caller, and the path to the wrong result>
Proof: <the command and its output, or the file:line chain>
Fix: <the smallest change that removes it>
```

End with "Could not prove" (if any) and "Not checked": what you skipped, such as the
running app, a real device or production data.

## Next rounds

- Review only the commits since the last review. Never repeat a finding.
- Each Important finding ends fixed, or answered with a reason. Unanswered blocks merge.
- Three rounds in a row with something Important means the approach is wrong. Say so.

## Owner-only changes

Billing, sign-in, account deletion, release config and CI wait for Ashish, whatever the
review says. Put that in the report's first line. The exact files are `OWNER_PATTERNS` in
`tools/verify-pr-evidence.mjs`.

The `verification evidence` check fails these PRs until Ashish comments
`/approve <commit>`, naming the commit he read. It counts only for that commit, so a later
push needs a new `/approve`. The comment re-runs the check. Bot PRs are held too. An agent
never posts it.

Removing or narrowing a field in `convex/schema.ts` is owner-only too, but no check can
see it. Flag it in the report.

## When a review misses something

- The same finding twice means a rule should become a lint, type or test, with a row in
  the `AGENTS.md` rules table.
- A bug that shipped past review becomes a case in `tools/review-eval`. Score any change
  to this file against those cases.

## House rules

Backend (`apps/native/convex`):

- [ ] Public queries and mutations use `authedQuery` / `authedMutation` and read
      `ctx.userId`, or sit in `PUBLIC_ON_PURPOSE` with a reason that matches the handler.
      Public actions get the user through the internal function they run. No `userId`
      argument from the client. Code acting for an account checks `liveOwner`.
- [ ] Pro features call `requireProEntitlement`. New link or note saves go through
      `createLinkOrNote`, or `createReadyPlaceSave` for a place save that is ready without
      a processing run. Both call `claimSave`, which counts free saves.
- [ ] Content sent to Gemini, SerpAPI or Treg is checked with `aiAllowed` /
      `internal.aiConsent.isAllowed` first. New accounts default to AI on; never call that
      collected consent.
- [ ] Public `args` / `returns` are unchanged, or expand-first with a `Convex-Api: changed`
      trailer. Validators match what the function returns.
- [ ] AI passes only add or remove `suggested` memberships. Exceptions: new matches go in
      as `saved` in an auto-file space, and `steerItemForSpace` may update `intents`. No AI
      pass overwrites `saved` or `dismissed`.
- [ ] A new table field stays declared once rows have it: roll back to `v.optional`.
- [ ] Growing tables are read through an index, not `.filter()`.
- [ ] Logs go through `logEvent` with scalar fields: no messages, URLs, user content or
      secrets.
- [ ] External fetches go through `safeFetch`.
- [ ] Test harnesses come from `newConvexTest()`.

Native app (`apps/native/src`):

- [ ] New copy is in every locale catalog; generated files are regenerated, not edited.
- [ ] A native module, config plugin, `app.json` or `app.config.js` change may move the
      fingerprint. If CI's `native fingerprint` job says CHANGED, the PR needs the
      `Native-Fingerprint: changed` trailer and a store build. The job cannot see `eas.json`
      build fields, `.easignore` or pnpm patches; judge those yourself
      ([details](docs/architecture/push-notifications.md#what-the-fingerprint-hashes)).
- [ ] No test file under `src/app`.
- [ ] Handled failures report through `analytics.captureError`.

Evidence (the check only sees that each section is filled in; you check it is true):

- [ ] It was taken on the current commit, or later commits cannot change what it shows.
- [ ] It shows what it claims: a passing run, the screen described.
- [ ] "Not verified" names what was skipped, and nothing risky hides there.
- [ ] A change to a flow in `tools/e2e` says whether that flow was run.
- [ ] The Review section has a count line, and each Important finding is fixed or answered.
