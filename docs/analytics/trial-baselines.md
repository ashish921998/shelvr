# Trial baselines

Reusable method and PostHog SQL for two baselines that the existing dashboards
do not separate: how far people get **before** a trial, and what trialists do
**after** one is confirmed. `trial-baselines.sql` holds the queries;
`validate-trial-baselines.sql` supplies synthetic validation parts assembled
with the production transformations. Neither file contains or implies a production number.

This document is method only. It does not establish a baseline, change the
product or its pricing, add instrumentation, or recommend anything. Producing
the baseline is authorized analytics work against the production PostHog
project, done by an operator with the access listed below. Numbers, dated
snapshots and interpretation go to the private `shelvr-notes` repo, never
here.

## Audit existing reports first

Before running anything, open these and note what they already answer and
how they define their populations. Reuse their definitions where they fit;
do not relabel them.

| Report                                                                                                       | What it already measures                                                                                                      | Reuse / do not reuse                                                                                                           |
| ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| [Onboarding and payment dashboard](https://us.posthog.com/project/546847/dashboard/2075680)                  | Onboarding step funnels (one-day window), paywall attempt → payment funnel (fourteen-day window), trial funnel, country trend | Same filters (`environment = production`, test-account exclusion). Its attempt funnel is person-based; Query 2a is per attempt |
| Trial cancellation insights [11832813](https://us.posthog.com/project/546847/insights/11832813), 11832829–31 | Known-voluntary cancel rate, survey mix, canceller saves                                                                      | Keep as the cancellation view. Query 4 adds outcome ordering, not reasons                                                      |
| [New production accounts](https://us.posthog.com/project/546847/insights/aMMNoHuN)                           | `account_created` excluding the Internal / Test users cohort                                                                  | Source of the internal account list (see prerequisites)                                                                        |
| [Useful returns dashboard](https://us.posthog.com/project/546847/dashboard/2073640), `useful-returns.sql`    | Seven-day same-item reopen and copy/share, per item, mature cohorts                                                           | Reuse the strict session rule. Its seven-day item window is **not** day-3 engagement and is not relabelled here                |
| `growth-funnel.md` section 2                                                                                 | Activation = first `item_saved` with `save_source != onboarding_demo`, anchored on `account_created`                          | Reuse the demo exclusion. The anchor is the account, not the trial; Query 3 re-anchors on `trial_started`                      |
| `payment-funnel.md`                                                                                          | Event contract, identity notes, production/sandbox mapping, trial funnel reading rules                                        | The contract every clause below depends on                                                                                     |

Read the result of that audit next to the queries here. If a saved insight
already answers a question with the same population definition, cite it
instead of re-deriving it.

## Operator prerequisites

- Authenticated access to PostHog project 546847 with SQL insights.
- **Internal account list.** Every statement starts with an
  `internal_accounts` CTE holding Convex user ids. The shipped placeholder
  matches nobody, so an unfilled list excludes nothing and the query still
  runs. Fill it from the Internal / Test users cohort (export its distinct
  ids, or read them from `account_created` rows for known internal emails)
  and verify it by checking that every `internal_*_excluded` column is above
  zero where an internal account is known to have acted. Saved insights get
  the same effect from the `filterTestAccounts` toggle; raw SQL does not,
  which is why the list is explicit. Internal people who never signed in on
  a production build cannot be excluded by account id; development and
  preview builds stamp a non-production `environment` and are already out.
- **Cohort start.** `toDateTime('2026-09-20 00:00:00')`, the first day
  `item_saved` carried `save_source`. Earlier saves have no source and would
  be dropped as unknown, so the cohort must not start before it. Narrow the
  window by moving the start later, and record the window with the result.
- **Maturity.** Each query reports immature rows separately and keeps them
  out of rates. The thresholds are in the SQL as literals: 1 day for
  onboarding and attempts, 24 and 72 hours for saves, 14 days for trial
  outcomes.
- **Enough observations.** The issue's checkpoints (about 100 genuine new
  users, about 30 completed trials) are review points, not significance
  guarantees. Report counts next to every rate.

## Populations

| Query | Unit                                    | Anchor                                                 | Denominator                                                | Window                                                 |
| ----- | --------------------------------------- | ------------------------------------------------------ | ---------------------------------------------------------- | ------------------------------------------------------ |
| 1     | Person (`person_id`)                    | First `onboarding_step_viewed` with `step_id = opener` | Openers, non-internal, opened ≥ 1 day ago                  | Opener to opener + 1 day, grouped by `flow_version`    |
| 2a    | Paywall attempt (`paywall_attempt_id`)  | `paywall_presentation_started`                         | Attempts started ≥ 1 day ago, non-internal                 | Outcome events with the same attempt id                |
| 2b    | Confirmed trial (`revenuecat_event_id`) | Webhook `trial_started`                                | Trial starts, non-internal                                 | Attempts by the same account within ±6 hours           |
| 3     | Trial account                           | First production `trial_started` carrying a webhook id | Trial accounts anchored ≥ 24 h / ≥ 72 h ago                | 24 and 72 elapsed hours from the anchor                |
| 4     | Account                                 | First production `trial_started` per account           | Trial accounts anchored ≥ 14 days ago; direct payers apart | Anchor to the next `trial_started` of the same account |

Pre-trial and trial populations are deliberately not one funnel. A pre-trial
person cannot make a personal save (saving needs Pro), so Query 1 ends at the
onboarding paywall attempt and has no save column. Query 3 starts at the
confirmed trial and never looks at onboarding.

### Decisions these queries fix, and how to change them

- **Onboarding progression is read from the first opener until one day
  later or the next opener view, whichever comes first.** Steps, demo,
  sign-in, account links, completion and the onboarding paywall count only
  inside that window. A replayed onboarding, on a later build or two hours
  later on the same day, is not credited to the first flow; it shows up as
  `persons_with_repeated_opener`. Change the day limit with the
  `INTERVAL 1 DAY` in the `windowed` CTE, and move the `mature` threshold
  with it so the window has closed before a person is counted.
- **The internal flag is not windowed.** `is_internal` reads every
  `auth_completed` of the person in the cohort period, so an internal account
  that signs in days after the opener still excludes the person. The windowed
  account columns (`account_count`, `new_accounts`, `signed_in`) stay
  progression measures and do not see that late sign-in.
- **Day 3 is 72 elapsed hours** from the trial anchor, matching the "within
  24 hours" wording and the interval style of `useful-returns.sql`. For
  calendar days, replace `trial_at + INTERVAL 72 HOUR` with
  `toStartOfDay(trial_at) + INTERVAL 3 DAY` in Query 3 and say so in the
  result.
- **Attempts, not people, are the pre-trial conversion denominator.** Query
  2a also reports `persons` and `persons_with_confirmed_trial` so a
  person-level reading is possible without changing the query.
- **Attribution window is ±6 hours** between an attempt's
  `paywall_presentation_started` and the webhook's `purchased_at_ms`.
  Widen it only with evidence of later-arriving `trial_started` events.
- **Outcome rates use anchors at least 14 days old.** 14 days is the payment
  dashboard's window for a seven-day trial. An account whose trial started
  less than 14 days ago is `immature` even when its conversion or expiry has
  already arrived; those are shown as `immature_converted` and
  `immature_expired`, never in the rate. A mature trial with no terminal
  event is `unknown_no_terminal_event`, never a failure.
- **The first trial's lifecycle ends at the next trial start.** Events at or
  after a second `trial_started` by the same account belong to that later
  trial and are never credited to the first anchor. A first trial with no
  terminal event before the second start is therefore unknown, not converted,
  even when the second trial converts.
- **Only a voluntary cancellation turns auto-renew off.** See the cancellation
  contract in [payment-funnel.md: Event contract](payment-funnel.md#event-contract); Query 4
  counts other categories separately without changing auto-renew state.

## Filters applied everywhere

Each statement extracts typed columns from `events` in its source CTEs and
applies the row filter as the first CTE of the transform block, so the
validation file exercises the filter with synthetic rows.

- `environment = 'production'` on every event. Client events get it from the
  build variant, backend events from `OBSERVABILITY_ENV`, and webhook events
  only when RevenueCat also reports PRODUCTION, so sandbox purchases are
  already labelled `sandbox`. The webhook queries additionally require
  `store_environment != 'sandbox'` as a belt-and-braces check, on webhook
  rows only. In Query 3 this predicate applies only to `trial_started`;
  `item_saved` and `item_opened` never carry `store_environment` and must
  pass without it. HogQL missing-property comparisons do not reliably pass
  `!=`, so applying this webhook filter to every activity row drops saves
  and opens.
- `analytics_version = 1` on every event, read as an integer. Every client,
  save, account and webhook event in the contract carries it.
- Internal accounts are flagged per row (`is_internal`) and counted in an
  `internal_*_excluded` column rather than silently dropped, so the operator
  can see the exclusion working.
- Identifiers that must be present: `paywall_attempt_id` for attempts,
  `revenuecat_event_id` for webhook events, `item_id` for saves and opens.
  Rows without them are not guessed into a match. Query 3 reports accounts
  whose only `trial_started` rows lack the webhook id; Queries 2 and 4 drop
  such rows, which the known gaps below explain.

### Identity

- Every backend event (`account_created`, `item_saved`, `trial_started`, the
  payment lifecycle) uses the Convex users-table id as `distinct_id`, and the
  client identifies PostHog with the same id once signed in. `item_opened` is
  client-only: it is sent by the authenticated app with that account id as
  `distinct_id`, and the backend `notifications.markItemOpened` mutation has
  no telemetry twin. Queries 2, 3 and 4 therefore key on `distinct_id`, which
  is also what makes the item-ownership join in Query 3 exact: a save and an
  open qualify together only when the same account id and the same `item_id`
  appear on both.
- Backend events are sent with `$process_person_profile: false`, so they do
  not update person profiles and their `person_id` may not be the merged
  person. Do not join backend events through `person_id`.
- Query 1 is the one place `person_id` is needed, because onboarding starts
  anonymous and PostHog merges that identity on sign-in. The link from a
  person to an account is read from the client's `auth_completed`, which
  fires after identify with the account id as `distinct_id`. A person with
  more than one account is counted in `persons_with_several_accounts` rather
  than attributed to either.
- Builds before the identity fix in `payment-funnel.md` reset PostHog on
  every signed-out launch and split a resumed onboarding across people. Read
  earlier flow versions with that in mind.

### Timestamps and duplicates

- Timestamp sources and retry identity follow
  [payment-funnel.md: Event contract](payment-funnel.md#event-contract), with save timestamps
  owned by [item telemetry](../../apps/native/convex/analytics.ts)
  and opens by [client analytics](../../apps/native/src/lib/analytics.ts).
- Deliveries retry with the same event UUID, so PostHog already drops exact
  repeats. The queries still collapse on the canonical id (`item_id`,
  `paywall_attempt_id`, `revenuecat_event_id`) and report how many extra rows
  they removed (`duplicate_presentation_rows`, `duplicate_deliveries_removed`),
  so a change in delivery behaviour shows up instead of inflating a count.
- A repeated `trial_started` for one account is a repeat trial. Query 3 and 4
  anchor on the first and report `accounts_with_repeat_trial_starts`; Query
  2b lists every trial event and marks `repeat_trial_starts`. Query 4 bounds
  the first trial's lifecycle at the second start (validation cases
  `l_repeat_trials` and `l_repeat_first_open`); read repeats separately.

## Query 1: pre-trial onboarding and sample progression

Per person, by the flow version of the first opener view: reached
`interests`, `setup`, `live_demo`, `notifications`, `share_practice`; picked
a first save (`onboarding_demo_picked`) and whether it was the ready-made
sample; the demo finished `ready` (`onboarding_demo_result`); signed in
(`auth_succeeded`, or any account linked through `auth_completed`); created a
new account (`account_created` for a linked account); completed onboarding;
and reached the onboarding paywall (`paywall_presentation_started` with
`placement = onboarding`). Every one of those is counted only from the first
opener view until one day later or the next opener view, whichever is first.
The internal flag alone looks at every `auth_completed` of the person.

Reading rules:

- Step ids are from [onboarding-steps.ts](../../apps/native/src/lib/onboarding-steps.ts) (`live_demo` and `share_practice`
  are the analytics ids of the demo and share steps). The current `ONBOARDING_FLOW_VERSION` (7 at the time of writing) defines the
  flow; earlier flows lack some steps, so compare within a flow version.
- `onboarding_step_viewed` fires once per step per onboarding mount, so a
  person can view later steps without a recorded opener only on an install
  that resumed from an older build. Those persons are outside the cohort.
- A second opener view (a reinstall, a replay after an update, a forced
  onboarding in QA) closes the first window and is counted in
  `persons_with_repeated_opener`. Events after it, or after the first day,
  belong to no flow in this report.
- An internal account that links to the person at any time in the cohort
  period excludes the person (`internal_persons_excluded`), even when the
  sign-in happened after the progression window closed.
- The demo save is a sample or a pasted link that bypasses the Pro gate. It
  is progression, not activation. Nothing in this query is a personal save.
- `persons_new_account` is bounded by `account_created`, which started on
  8 September 2026 and is not backfilled.

## Query 2a and 2b: attempts, outcomes and trial confirmation

Per attempt, the earliest outcome event with the same `paywall_attempt_id`
decides the outcome: `cancelled`, `failed`, `purchase_completed`,
`restored`, or `unresolved` when none arrived. `paywall_shown` is reported
as `shown_confirmed_attempts` only; it is never a denominator. An attempt
started less than a day ago is immature and kept out of rates. Attempt ids
that only ever appear on outcome events are counted as
`outcome_only_attempt_ids` and excluded.

Honest outcomes:

- `unresolved` means the promise never settled in telemetry: a force quit, a
  sheet still pending, or a client that lost the event. It is not
  abandonment. `paywall_cancelled` is the explicit cancel.
- `purchase_completed` is a client checkout. It can start a free trial and
  is not evidence of payment or of a trial. Confirmation comes from the
  webhook: a `trial_started` by the same account whose
  `paywall_presentation_started` is within ±6 hours.
- Attribution rule for repeated attempts by one account: candidates are that
  account's attempts in the window whose outcome is `purchase_completed` or
  `unresolved`; a `purchase_completed` candidate beats an `unresolved` one,
  then the closest start time wins. Each trial attributes to at most one
  attempt. A trial matched to an unresolved attempt is the interrupted-sheet
  case and is reported as `unresolved_with_confirmed_trial`.
- A trial with no candidate is `unmatched` in Query 2b and stays a gap
  (a lost client event, a different device, or a purchase outside the app).
  Do not infer an attempt for it.
- A sandbox trial or a `trial_started` without `revenuecat_event_id` never
  confirms an attempt; the attempt stays a plain `purchase_completed`
  (validation cases `att_sandbox_trial`, `att_noid_trial`).
- `offering_id` and `trial_eligible` exist only on client attempt events, and
  only when RevenueCat could read the offering before the sheet opened. The
  webhook carries `product_id`. There is no published paywall revision id on
  any event; segmenting by revision needs the RevenueCat dashboard's revision
  dates and is a documented gap, not a column.

## Query 3: trial-anchored personal save and return

Per trial account, from the first production `trial_started` that carries a
`revenuecat_event_id`:

- `first_personal_save_within_24h`: an `item_saved` with a known
  `save_source` other than `onboarding_demo`, at or after the anchor and at
  most 24 hours later. Boundary inclusive.
- `distinct_saves_72h`: distinct `item_id` values saved in the first 72
  hours, reported as 0 / 1 / 2 / 3+.
- `reopened_own_item_by_72h`: one of those in-window saves was opened by the
  same account, after its save, by 72 hours, in a nonempty PostHog session
  different from the save session. This is the useful-returns rule with a
  72-hour window and without the copy/share step. Items saved before the
  anchor, foreign items, opens before the save, same-session opens and opens
  after 72 hours do not qualify.
- Unknown sessions are reported, not assumed: an account whose in-window
  saves all lack `save_session_id` is `saves_without_session_72h` and is
  excluded from `reopen_percent_of_measurable`. An open without a session id
  cannot qualify.
- `demo_saves_excluded` and `unknown_source_saves_excluded` show what the
  filters removed. A save with no `save_source` is from before 2026-09-20 or
  from a path that did not stamp one; it is identified, never treated as
  personal.
- `personal_saves_before_anchor` is a diagnostic. With saving gated on Pro it
  should be near zero; a count there means a direct purchase before a later
  trial, an entitlement granted another way, or a clock skew worth looking
  at.
- **Missing webhook id.** A `trial_started` row without `revenuecat_event_id`
  cannot be deduplicated and does not anchor anything. An account whose only
  trial rows lack the id is counted in `accounts_without_webhook_id` and
  enters no rate; every such row is counted in
  `trial_start_events_missing_id`. When the same account also has a row with
  the id, that row is the anchor and the bad row is only counted.
- Maturity: 24-hour metrics use trials anchored at least 24 hours ago,
  72-hour metrics at least 72 hours ago; `immature_*_trials` are listed
  separately.

## Query 4: trial lifecycle

Per account, lifecycle events are deduplicated on `revenuecat_event_id`,
classified, sorted by their own timestamps, and bounded to the first trial:
at or after its `trial_started`, and before the account's next
`trial_started` if there is one.

- `converted`: `payment_succeeded` with `payment_kind = trial_conversion` in
  the bounded window. A `payment_kind = initial` charge is a direct purchase
  and is never a conversion; `renewal` is an ordinary renewal and is counted
  only as `renewals_excluded`.
- `expired`: `trial_expired` in the bounded window. The earliest of
  conversion and expiry is the terminal event.
- `pending`: no terminal event and the anchor is less than 14 days old.
- `unknown_no_terminal_event`: no terminal event in the bounded window and
  the anchor is at least 14 days old. This is a coverage gap (a missed or
  dropped webhook, a conversion row without its id, a transfer, a refund path
  not in this vocabulary, or a repeat trial that started before the first one
  settled) and is reported, not counted as expired.
- `mature` is `trial_at <= now() - 14 days`. `converted`, `expired` and
  `unknown_no_terminal_event` in the output count mature accounts only;
  `immature_trials`, `immature_converted`, `immature_expired` and `pending`
  cover the rest. `conversion_percent_of_settled` divides mature conversions
  by mature conversions plus mature expiries. Pending, immature and unknown
  rows are shown beside it, never folded into either side.
- `auto_renew_state` is the last of voluntary `trial_cancelled` and
  `subscription_uncancelled` (with `payment_kind = trial`) before the
  terminal event, or before now: `never_cancelled`, `off`, or `re_enabled`.
  `pending_auto_renew_off` is a cancelled trial still inside its window; it
  is not an expiry. `converted_after_cancel` and `expired_after_cancel`
  show voluntary cancellations that were later reversed or not.
- `trial_cancelled` with any `cancel_category` other than `voluntary`
  (`refund`, `billing`, `developer`, `unknown`, or absent) leaves
  `auto_renew_state` and `ever_cancelled` alone and is counted in
  `accounts_with_non_voluntary_cancel` and `non_voluntary_cancel_events`.
  Read those next to the cancellation insights, which classify reasons.
- Accounts with a direct initial charge and no trial are a separate
  `population` row (`direct_initial_no_trial`) and are not divided into any
  trial rate. A direct charge after an expired trial stays in the trial
  population and is counted in `accounts_direct_initial_after_trial`.
- `subscription_uncancelled` with `payment_kind = subscription` and any
  other webhook kinds are `other_lifecycle_events_ignored`.

## Known gaps

- No paywall revision identifier exists on any event. `offering_id` is the
  closest client-side field and is absent when the SDK had no cached
  offering.
- `account_created`, `auth_succeeded`, `save_source` and the paywall context
  fields each start on a different date. The cohort start above is the
  latest of the ones Query 3 needs; Query 1 and 2 columns that depend on a
  later field undercount before that field shipped.
- Webhook rows without `revenuecat_event_id` cannot be deduplicated. Query 3
  counts them; Queries 2 and 4 drop them, so a conversion whose row lost its
  id reads as `unknown_no_terminal_event` (validation case
  `l_missing_id_conversion`) and a trial start without one is invisible to
  Query 2b and Query 4. The contract always sets the id, so a non-zero
  `trial_start_events_missing_id` in Query 3 is itself a finding.
- App Store Connect installs and RevenueCat customer totals are aggregates
  and cannot be joined to these person-level populations. Use them for
  corroboration only.
- A free-save allowance (#257), if it ships, changes who can make a personal
  save and would need a labelled pre-change baseline from these queries
  before any comparison.
- Website identities are separate from app identities; nothing here reaches
  back to a landing page.

## Validation

`validate-trial-baselines.sql` stores only synthetic sources, literal expected
rows and self-checking tails. Assemble the five read-only statements from the
production transforms (Query 2 shares one source and transform):

```sh
node tools/assemble-analytics-validation.mjs
node --test tools/assemble-analytics-validation.test.mjs
```

Paste one emitted statement at a time into a PostHog SQL insight. Every `ok`
must be 1, including `__row_count__`; mismatching column names diagnose failures.
Missing expected cases fail the left join; extra or duplicate cases fail the
count/unique-id guard. Expected literals are transcribed from the original
methodology tables, not observed engine results. Fix the SQL, not the expected
rows, on a difference. These checks say nothing about production rates.

**HogQL was not executed.** The first authorized engine run must also confirm
same-SELECT alias reuse: `bounded` in Query 4, `persons_demo_ready` and
`mature_openers` in Query 1, and the newly inlined `window_saves` and
`pre_terminal`. Local assembler tests verify structure, not SQL semantics.

Before restructuring, a temporary original-head fixture comparison passed:
all five assembled validation statements were byte-identical to `cd8d9881`
(`node --test tools/assemble-analytics-validation.test.mjs`, 1/1 pass).
The fixture was removed after that green run; permanent tests cover assembly.

Synthetic rows carry `environment`, `analytics_version` and the required
ids. Webhook rows also carry `store_environment`; Query 3 save/open rows
use `NULL` to represent its absence, not an empty-string stand-in.
These cases exercise each statement's filter: rows tagged
`development`, `sandbox`, `analytics_version = 0`, or with an empty required
id must be absent from the output. The absent cases are listed under each
case section.

### Query 1 cases

Absent: `p_no_opener` (no opener view), `p_dev_env` (every row tagged
`development`), `p_version_0` (`analytics_version = 0`).

- `p_replay_later` opened flow 6, then replayed flow 7 four days later with
  setup, demo and a sign-in. Only the flow 6 interests view is inside the
  first day, so the flow is 6, `opener_views` is 2 and nothing from the
  replay is credited, including the account link.
- `p_same_day_replay` opened flow 6, viewed interests, then opened flow 7
  two hours later and went on to setup, demo, sign-in, completion and the
  onboarding paywall. The second opener closes the first window inside the
  same day, so the flow is 6, `opener_views` is 2 and only the interests view
  is credited; `signed_in`, `completed` and `paywall_attempted` stay 0.
- `p_internal_late_auth` opened and viewed interests, then linked
  `acct-internal` more than two days later, outside the window. The person is
  `is_internal = 1` all the same, while `account_count` and `signed_in` stay 0
  because the account columns are windowed progression.
- `p_late_step` viewed setup exactly 24 hours after the opener (counted,
  boundary inclusive) and the demo one second later (not counted).
- `p_dev_account` linked an account whose `account_created` row is tagged
  `development`, so it is signed in but not a new account.
- `p_mixed_env` has a production opener and a development interests view;
  the latter is filtered, so `reached_interests` is 0.
- The `acct-orphan` and `acct-replay` rows in `account_rows` affect nothing:
  no person links to the first inside a window, and the second's link is
  outside its person's window.

### Query 2a cases

Absent: `att_dev_env` (tagged `development`), `att_version_0`
(`analytics_version = 0`), and the `acct-a` presentation row with an empty
`paywall_attempt_id` (no row with an empty `case_id` may appear).

`att_orphan_outcome` has `presentation_events = 0`, so the production
query counts it under `outcome_only_attempt_ids` and nowhere else; its
`mature` flag is meaningless there. `att_purchase_no_trial` shows a checkout
that is not a trial. `att_g_outside_window` shows a checkout whose trial
arrived too far away to attribute. `att_sandbox_trial` and `att_noid_trial`
completed a checkout whose only `trial_started` is sandbox or lacks its
webhook id, so neither is confirmed.

### Query 2b cases

Absent: `rc-trial-sandbox` (`store_environment = sandbox`), `rc-trial-dev`
(tagged `development`), `rc-trial-v0` (`analytics_version = 0`), and the
`acct-n` trial row with an empty `revenuecat_event_id`.

`rc-trial-b` is delivered twice and appears once with `deliveries = 2`.
`rc-trial-f` has two candidates and the `purchase_completed` one wins over
the earlier unresolved one. `rc-trial-e` ignores the cancelled first attempt.

### Query 3 cases

Absent: `acct-other` (saved the item that `t_foreign_item` opened and has no
trial), `t_sandbox_trial` (its trial row is `store_environment = sandbox`,
leaving only a save), `t_dev_env` (tagged `development`), `t_version_0`
(`analytics_version = 0`).

- `t_missing_store_env` saves two hours after its trial and opens the same
  item thirty hours after the trial in another session. Both activity rows
  lack `store_environment`, yet `saved_within_24h`, `distinct_saves_72h` and
  `reopened_own_72h` are 1. Only this case reopens; every other case fails
  a clause of the reopen rule or has nothing measurable.
- `t_missing_trial_id` has a `trial_started` without its webhook id, so it
  has no anchor, every metric is 0, and the production query counts it in
  `accounts_without_webhook_id` and `trial_start_events_missing_id`, outside
  every rate. `t_mixed_trial_id` has one bad row two days before its good
  one; the good one anchors, so the save two hours later is within 24 hours.
- `t_dev_save` has a production trial and a save tagged `development`; the
  save is filtered, so the account counts as no save.
- In the production query `t_immature` and `t_immature_72h` would sit in the
  `immature_*_trials` columns and outside every rate.

### Query 4 cases

Absent: `l_missing_id_trial` (its only row has an empty
`revenuecat_event_id`), `l_sandbox` (`store_environment = sandbox`),
`l_dev_env` (tagged `development`), `l_version_0` (`analytics_version = 0`).

- `l_repeat_first_open` started a trial 40 days ago with no terminal event,
  started another 10 days ago and converted 3 days ago. The conversion falls
  after the second start, so the first trial is
  `unknown_no_terminal_event`, not `converted`. `l_repeat_trials` is the
  settled variant: the first trial expired before the second started.
- `l_converted_recent` and `l_expired_recent` have terminal events but
  anchors only 5 days old, so `mature = 0`; in the production query they are
  `immature_converted` and `immature_expired` and outside the rate.
- `l_refund_cancel_converted`, `l_billing_cancel_expired` and
  `l_unknown_cancel_pending` carry non-voluntary `cancel_category` values.
  None of them turns auto-renew off or sets `ever_cancelled`; each is one
  `other_cancels`.
- `l_cancel_reenable_pending` and `l_cancel_reenable_converted` show a
  voluntary cancel followed by `subscription_uncancelled`, which restores
  `re_enabled`. `l_uncancel_then_cancel` shows ordering by event time.
- `l_cancel_pending` shows that a voluntary cancellation inside the window
  is pending with auto-renew off, not expired.
- `l_missing_id_conversion` lost the id on its conversion row; the row is
  dropped and the trial reads as unknown, which is the documented gap.
- `l_pre_anchor_event` shows a stale expiry before the anchor being ignored.

## Reporting results

When the queries are run for real: record the cohort window, the internal
list's size, every `immature_*`, `unknown_*`, `unmatched`,
`*_missing_id`, `*_without_webhook_id` and `*_excluded` count beside its
rate, the flow versions and products present, and the PostHog insight ids.
Those go to `shelvr-notes`. This file changes only when the method does.
