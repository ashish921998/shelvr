# Review eval

A small, fixed set of past Shelvr pull requests for measuring how well a reviewer (Codex with
the thermos skill, the CI Claude review, or any other) catches real bugs. Run it before and
after changing how reviews work, and compare.

`cases.json` holds 17 cases:

- **12 `bug` cases.** Each is a merged PR that shipped a bug a later PR fixed. `commit` is
  the merge of the PR under review, `fixedBy` / `fixCommits` the fix, and `expected` the bug
  a good review should have flagged.
- **5 `clean` cases.** Merged PRs that no later fix was traced to. A finding here is a false
  alarm unless it holds up when checked by hand. "No fix traced" is weaker than "no bug", so
  treat a confirmed finding on a clean case as a reviewer win and move the case.

Cases were chosen by tracing fix commits on `main` back to the commit that introduced the
lines they changed (`git blame` on each fix's parent), keeping only fixes whose bug sits
clearly in one earlier PR.

## Running one case

1. Make a worktree at the parent of `commit` (`git worktree add <dir> <commit>^`), so
   nothing from the fix or its discussion is visible. Do not give the reviewer the PR
   thread, later commits, or `expected`.
2. Hand the reviewer the PR's diff (`git diff <commit>^ <commit>`) as the change to review,
   with the same prompt and files it gets on a real PR.
3. Save its findings as written. Run each case once per reviewer setup.

## Scoring

Per reviewer setup, record:

- **Catch rate:** bug cases where a finding names the `expected` bug (same cause, not just
  the same file), out of 12.
- **False alarms:** findings on clean cases, plus findings on bug cases that are wrong when
  checked.
- **Cost and time:** tokens or dollars, and wall time per case.
- **Triage time:** how long a person needs to read the findings and decide.

Keep cases `pr279`, `pr194` and `pr262` aside as a holdout: tune prompts or `REVIEW.md` on
the rest, then check the holdout to be sure a change did not just fit the set.

## Caveats

- Today's `REVIEW.md` and `CLAUDE.md` contain rules learned from some of these bugs (the
  public Convex contract rule came from #46). A reviewer given today's files gets a hint
  the original reviewer did not have. Note which files each run used.
- Some bugs only show at runtime (`pr195` needed a live Pinterest read; `pr194` needed
  RevenueCat's fallback screen). Missing them from the diff alone is expected; they are the
  cases running the code would catch.

When a new bug escapes review, add it here as a `bug` case and add the rule it broke to
`REVIEW.md`.
