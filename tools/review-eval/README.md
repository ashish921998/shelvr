# Review eval

A small, fixed set of past Shelvr pull requests for measuring how well a reviewer (Codex with
the thermos skill, the CI Claude review, or any other) catches real bugs. Run it before and
after changing how reviews work, and compare.

`cases.json` holds 19 cases:

- **12 `bug` cases.** Each is a merged PR that shipped at least one bug a later PR fixed.
  `commit` is the merge of the PR under review and `fixedBy` / `fixCommits` the fix. `bugs`
  lists each failure as its own target, so a PR that shipped three bugs is scored three
  times. Each target is tagged:
  - `diff` (12 targets): a careful reader of the diff could have flagged it.
  - `runtime` (5): it only showed when the code ran against a real service or device, such
    as a live Pinterest read or RevenueCat's fallback screen.
  - `product` (1, `pr139`): the code did what it meant to; the product call was wrong.
    Recorded for completeness, never scored.

  The tags are a judgment made when the cases were picked. A judge who disagrees with one
  should note it.

- **7 `clean` cases.** Merged PRs that no later fix was traced to. `pr135` and `pr203` are
  about the size of a typical bug case (around 1,000 changed lines); the other five are
  small, so compare false alarms on the two groups separately. "No fix traced" is weaker
  than "no bug", so treat a confirmed finding on a clean case as a reviewer win and move
  the case.

Cases were chosen by tracing fix commits on `main` back to the commit that introduced the
lines they changed (`git blame` on each fix's parent), keeping only fixes whose bug sits
clearly in one earlier PR.

## Running one case

1. Export the parent of `commit` with no history: `git archive <commit>^ | tar -x -C <dir>`.
   A worktree or clone still carries `.git`, so a reviewer could read the fix in later refs.
2. Run the reviewer with an empty `HOME` and no memory or project files, so nothing
   written after the PR reaches it except the guidance under test. If the setup uses a
   `REVIEW.md` or prompt, copy that version into the export and record its commit; a
   baseline run uses none.
3. Hand the reviewer the PR's diff (`git diff <commit>^ <commit>`) as the change to review,
   with the same prompt it gets on a real PR. Do not give it the PR thread, later commits,
   or `bugs`.
4. Save its findings as written.

## Scoring

A judge who did not run the reviewer, and does not know which reviewer it was, marks each
`diff` and `runtime` target `caught`, `partial` (right place, wrong or vague cause) or
`missed`. A finding catches a target only if it names the same cause, not just the same
file.

Per reviewer setup, record:

- **Diff catch rate:** `diff` targets caught, out of 12. This is the number to compare.
  Report `runtime` targets caught separately; missing them from a diff is expected, and they
  are what running the code would catch.
- **False alarms:** findings rejected when checked by hand, on any case. A confirmed
  finding on a clean case is a reviewer win: record it separately and move the case.
- **Cost and time:** tokens or dollars, and wall time per case.
- **Triage time:** how long a person needs to read the findings and decide.

With 12 scored targets, one target moves the catch rate by about 8 points. Run each setup
at least twice and treat a gap smaller than two targets as noise.

## Caveats

- Nothing here is held out. The set is too small for a holdout to show overfitting, so the
  real test is new escapes: when a bug ships past review, add it here before changing any
  prompt, and see whether the changed setup would have caught it.
- Rules learned from these bugs are now written down (the public Convex contract rule came
  from #46). A reviewer given today's `REVIEW.md`, `CLAUDE.md` or memory gets a hint the
  original reviewer did not have. Note which files each run used.

When a new bug escapes review, add it here as a `bug` case and add the rule it broke to
`REVIEW.md`.
