# Review checklist

Every reviewer of a Shelvr pull request reads this first: the CI Claude review, Codex, and
any agent asked to review. It is a checklist, not the rules themselves. Each line points to
where the rule lives in `CLAUDE.md` or `AGENTS.md`; when they disagree, those files win.

## What to report

Report only what would hurt a person using the app or the business:

- a correctness bug on a real path (name the caller or input that reaches it)
- a security or privacy problem
- a broken contract with installed apps, a stuck deploy, or a stranded OTA
- evidence that does not prove what the pull request claims

Skip style, naming, formatting, and "could be cleaner" notes. Do not report the same
finding twice across reruns, and do not count two reviewers agreeing as proof: check it.

## Shelvr house rules

Backend (`apps/native/convex`):

- [ ] Every public function derives the user with `requireUserId(ctx)` (`model/auth.ts`).
      No `userId` argument from the client. Code that acts for an account checks it is
      still live (`liveOwner`), not mid-deletion.
- [ ] Every save and Pro feature calls `requireProEntitlement(ctx, userId)`.
- [ ] Anything that sends user content to Gemini, SerpAPI or Treg checks AI
      consent first (`aiAllowed` in `aiConsent.ts`, `internal.aiConsent.isAllowed`
      from actions).
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
- [ ] A change to native modules, config plugins, `app.json` or `app.config.js` moves the
      fingerprint: it needs the `Native-Fingerprint: changed` trailer and a store build.
- [ ] No test file under `src/app`.
- [ ] Handled failures report through `analytics.captureError`.

## Evidence

The PR evidence check only confirms the Verification section and screenshots exist. The
reviewer checks that they are right:

- [ ] The evidence was taken on the current head commit, or on one whose later commits
      cannot change what it shows.
- [ ] The result shown is the result claimed (a passing run, the screen described).
- [ ] "Not verified" names what was skipped, and nothing risky hides there.
- [ ] A change to a flow covered by `tools/e2e` says whether that flow was run.
