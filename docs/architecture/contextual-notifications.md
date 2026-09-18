# Contextual notifications

What Shelvr sends, when it sends it, and how it is built.
[Push notification builds and updates](push-notifications.md) stays the
reference for credentials, EAS profiles and OTA fingerprints.

Status: V1 below is implemented and awaiting deploy. Everything under
[Beyond V1](#beyond-v1) is parked research, not a plan of record.

## V1

**One notification — the one that already exists — made specific, and
measured.** That is the whole of V1.

### What changes

1. **The Sunday notification names a save instead of counting them.**
   Before: _3 saves waiting for you._
   After: _"The 12-hour short rib" and 2 more you saved this week._
2. **Four events, so we can see what happens:**
   `notification_permission_result` (only when the user was actually
   prompted), `notification_sent` (once per digest, when delivery reaches a
   terminal state, carrying whether a provider accepted it),
   `notification_opened`, and `notification_disabled`.

### What does not change

The Sunday 09:00 local schedule, the three-unopened-saves floor, the digest
screen, the single on/off switch, and the whole delivery machine. All of it
already works and none of it is touched.

### What we learn

Two numbers: **do people open it, and do they turn it off?** Those decide
everything else.

### Why this small

Shelvr exists because people save things and forget them. The notification is
where the product either delivers on that or does not, and right now nobody
knows which, because nothing measures it.

Everything below this section is a way to send _better_ notifications. None of
it is worth building before we know whether anyone opens a notification from
Shelvr at all. That is one number, and V1 is the cheapest way to get it.

### Explicitly not in V1

Every other notification kind, the budget arbiter, per-kind switches, the
outbox rewrite, holdout groups, rich images, geofencing, Screen Time. Parked
below; none of it blocks V1.

V1 is days of work. No new permission, no new native build, no change to any
public function's shape.

### Decisions taken

- **Lapsed users keep getting it.** Someone whose subscription ended can still
  read what they already saved. A reminder about their own save is the most
  honest reason to come back, and the paywall is already there when they
  arrive.
- **File the Apple Screen Time request now.** Paperwork rather than
  engineering, weeks of waiting, refusable, and free if we never build the
  feature. Starting it now costs nothing and removes a two-month stall later.
- **If V1 shows people do not open it, stop here.** Do not iterate on copy
  indefinitely. The weekly shelf is the floor, not the opening move of a
  campaign. Deciding this before seeing the number is the point.
- **Holdout groups wait.** V1 asks "does anyone open this", which needs no
  control group. A holdout is how you decide whether to _add_ kinds, and that
  is V2's question. When it comes: 10% per kind, 8 weeks, then rotate in.

## Evidence status

This document mixes things that are true of the repository, things that are
true of the platforms, and things we believe about users. They are not the
same kind of claim and are labelled throughout:

- **Verified** — checked against this repository, or against the installed
  package's own types and source. Cited where it matters.
- **Platform constraint** — imposed by Apple, Google or Expo. Not negotiable.
- **User feedback** — something a real user actually told us. Stronger than a
  hypothesis and weaker than a measurement: people describe what they want far
  more accurately than they predict what they will do.
- **Hypothesis** — a belief about user behaviour that we have no data for
  yet. Every one of these is something the first release should measure, and
  none of them should be treated as settled.

The single biggest risk in this design is not a technical one. It is that a
system built to be humane is evaluated with a metric that cannot see whether
it worked. [Measurement](#measurement) is therefore the first section that
matters and the first phase that ships.

## Beyond V1

Everything from here on is parked. It is the research behind the V1 choice and
the shape a later version might take — useful for deciding what comes next, and
not a commitment to build any of it. Read it when V1's two numbers are in.

## The long-run shape

By default Shelvr sends **at most two notifications a week**, arbitrated
server-side, with every one of them naming a specific thing the user saved.
Anything above that ceiling requires an opt-in the user configured
themselves, defaults to off, and is shown to them as a weekly total before
they turn it on. Kinds that go repeatedly unopened slow down rather than stop,
because non-opening is an uncertain signal and not proof of rejection. The
first release adds no new notification kinds at all: it instruments the one
that exists, improves its copy, and establishes a baseline against a holdout
group, so that every later decision is an evaluation rather than a guess.

## Principles

1. **A notification is a claim on attention that has to be repaid.**
2. **Name the thing.** Every body references a real save. `3 saves waiting for
you` is the copy we are replacing.
3. **Say only what we can observe.** We know what was saved, when, and whether
   it was opened. We do not know whether it was read, visited, cooked or
   enjoyed. Copy may not imply otherwise.
4. **Contextual means better-chosen, not more.** The budget is fixed before
   the catalogue, so a new idea must beat an existing kind rather than add to
   it.
5. **Silence is a valid output.** Every kind has a silent condition, and none
   may substitute filler to occupy a slot.
6. **Never notify about the app's own housekeeping.** Classification
   finished, an item was enriched, a space was recommended — chores, not news.
7. **The user can turn one thing off without turning everything off.**
8. **Ambiguous signals get proportional responses.** We reduce volume on weak
   evidence; we only stop on strong evidence.

## What exists today

Verified against the repository.

| Piece                         | State                                                             |
| ----------------------------- | ----------------------------------------------------------------- |
| Expo Push, APNs, FCM v1       | Working; see `push-notifications.md`                              |
| `notificationDevices`         | One token per device, guarded against takeover                    |
| `notificationPreferences`     | A single `weeklyShelfEnabled` boolean, `nextDigestAt`, `timezone` |
| `weeklyDigests`               | Persisted shelf contents **and** its delivery state               |
| `notificationDelivery.ts`     | claim / finish / recover, 8 attempts, receipt polling, backoff    |
| `crons.ts`                    | Hourly `prepareDueWeeklyDigests`, 5-minute recovery               |
| `model/notificationFields.ts` | `digestCopy` plus nine locale catalogs                            |
| `itemReads`                   | Per-user read state; already the digest's unread filter           |
| Deep links                    | `data.url` routed by `useNotificationObserver`                    |
| Android channel               | `weekly-shelf`, created in `notification-token.ts`                |
| Opt-in prompt                 | `WeeklyNudgeSheet`, once, after the first share-sheet save        |

The delivery machine is the strongest part of this system. The design below
reuses it rather than replacing it.

Gaps, all verified:

- **One kind behind one boolean.** A second kind on `weeklyShelfEnabled`
  means one bad notification costs us every notification.
- **No notification analytics of any kind.** No event for a permission
  prompt, a send, a delivery or an open. `markDigestOpened` writes a
  timestamp nothing reads back.
- **The existing success metric cannot see notifications, and cannot see
  resurfacing at all.** See [Measurement](#measurement). This is the finding
  that reorders the whole plan.
- **No budget.** Nothing prevents two kinds landing in the same hour.
- **Generic copy.** `digestCopy` interpolates a count and nothing else.

Two schema facts that kill otherwise good ideas. `intents` of kind
`add_event` carry **an event title only, never a date**, so time-based event
reminders cannot be built honestly today. `items.latitude/longitude` is EXIF
GPS from photos the user shot — it records where they were, which is not the
same as where they intend to go.

## Measurement

### Why the existing metric cannot grade this work

`docs/analytics/README.md` defines a **useful return**: a reopen in a later
session followed by a `copy` or confirmed `share`, both **within 7 days of the
save**. `useful-returns.sql` implements exactly that — lines 25 and 31 bound
outcomes at `saved_at + INTERVAL 7 DAY`, and line 43 only admits saves older
than 7 days.

Two consequences, both verified against the query:

1. **Resurfacing is unmeasurable by construction.** It deliberately targets
   saves older than 14 days. An action it produces on day 30 falls outside
   `saved_at + 7 days` and can never be counted. Judged by this metric, a
   perfectly working resurfacing notification scores zero.
2. **Segmenting by source is a real query change, not a flag.** Line 9
   collects opens as `groupArrayIf(tuple(timestamp, session_id), ...)`. There
   is no `source` in the query at all. Carrying source through requires
   changing that aggregation and the outcome expressions that consume it.

An earlier draft of this document claimed adding `"notification"` to the
`item_opened` source allowlist would make the existing query segmentable with
no query change. That was wrong. The allowlist change is still necessary —
`analytics.ts` currently collapses every source outside
`home`/`space`/`search` to `"direct"`, so notification opens are invisible at
the event level too — but it is not sufficient.

### The notification-anchored metric

Add a second, separate query — `docs/analytics/notification-outcomes.sql` —
anchored to the notification rather than the save. Leave
`useful-returns.sql` untouched as the save-anchored baseline.

> A **notification-useful return** is a qualifying item action (`copy`,
> `share`, `open_source`) performed within 72 hours of a
> `notification_opened`, on an item reached from that notification.

The weekly shelf is the one kind where the existing save-anchored metric
partially works, because it only ever contains saves from the last 7 days.
Every other kind needs the notification-anchored one.

### Attribution

A digest notification points at many items, so attribution has to survive
`digest → item → action`. Two options, and the choice matters:

- **Time-window attribution** — credit any action within N hours of a
  notification open. Simple; over-credits activity the notification did not
  cause.
- **Navigation-lineage attribution** — carry a `notificationId` as a route
  parameter from the notification through `/digest/{id}` to `/item/{id}`, held
  in a context scoped to that navigation stack, and stamp it onto
  `item_opened` and `item_action`. Under-credits a user who leaves and comes
  back later.

**Use lineage.** Under-crediting is the safer error: it makes notifications
look worse than they are, which biases us toward sending fewer. Record the
known undercount rather than correcting for it.

This means `item_action` needs the attribution property too. An `item_opened`
carrying `source: "notification"` with no matching action property makes the
join impossible.

### The holdout

**No notification kind ships without a randomised holdout that receives
nothing.** Without it we cannot distinguish a notification that created a
return from one that merely captured a return that was going to happen anyway
— and for a save-it-for-later product, where the user already intended to come
back, that distinction is the entire question.

Hold out 10% per kind, assigned per user, stable across kinds so the groups
stay comparable. Compare notification-useful returns per user per week between
arms, not open rates.

### Events

| Event                               | Origin | Fields                                        |
| ----------------------------------- | ------ | --------------------------------------------- |
| `notification_permission_requested` | client | `trigger`, `provisional`                      |
| `notification_permission_result`    | client | `status`, `provisional`                       |
| `notification_sent`                 | Convex | `kind`, `notification_id`, `arm`              |
| `notification_accepted_by_provider` | Convex | `kind`, `notification_id`, `latency_ms`       |
| `notification_suppressed`           | Convex | `kind`, `reason`                              |
| `notification_opened`               | client | `kind`, `notification_id`, `action`, `age_ms` |
| `notification_action`               | client | `kind`, `action`                              |
| `notification_cadence_reduced`      | Convex | `kind`, `step`                                |

`notification_accepted_by_provider` is deliberately not called
`notification_delivered` — see [Non-opening](#non-opening-is-an-uncertain-signal).

`reason` is a closed set: `budget`, `quiet_hours`, `cadence_reduced`,
`user_disabled`, `no_content`, `no_devices`, `holdout`. All properties are
categorical; item titles appear in notification bodies but never in event
properties, per the existing rule in `CLAUDE.md`.

### What the first release must answer

- What fraction of users have notifications enabled, and under provisional
  versus full authorization?
- For the weekly shelf: accepted → opened → notification-useful return.
- Does the notified arm produce more useful returns per user per week than
  the holdout? **If not, the correct response is to send less, not to tune
  the copy.**

## The volume promise

The previous draft claimed a two-per-week ceiling while separately permitting
`trial_ending` to bypass it and allowing two device-originated kinds outside
it. At the defaults that draft proposed, a fully opted-in user could receive
**23 notifications a week** — two pushes, seven place alerts and fourteen
interruptions. That is a contradiction, not a ceiling, and it is corrected
here.

### Three buckets, one headline

| Bucket                                                           | Who initiates         | Default | Ceiling                                             |
| ---------------------------------------------------------------- | --------------------- | ------- | --------------------------------------------------- |
| **Unrequested** — `weekly_shelf`, `quiet_week`, `resurfacing`    | Shelvr                | On      | **2 per 7 days, ≤1 per day**                        |
| **Lifecycle** — `trial_ending`                                   | A billing fact        | On      | **1 per trial**, ≤2 per account lifetime            |
| **User-requested** — `reading_time`, `nearby_place`, `intercept` | The user turned it on | **Off** | Combined **≤1 per day**, user-settable down to zero |

> **A user who changes nothing receives at most two notifications a week, plus
> at most one notification per trial.**

That is the promise, and it is the whole promise. Everything above it is
something the user switched on.

### Permitted versus expected

Permitted volume is not predicted volume, but users experience permitted
volume as the risk. State both.

| Configuration                         | Permitted per week | Expected per week |
| ------------------------------------- | -----------------: | ----------------: |
| Default                               |                  2 |               0–1 |
| All opt-ins on, at their own defaults |                  9 |               1–3 |
| All opt-ins at maximum                |                  9 |           up to 9 |

When a user enables a requested kind, Settings shows the resulting weekly
maximum as a single number before they confirm, and shows their current
configured maximum alongside the switches. A user should never be able to
arrive at nine a week without having seen the number nine.

`trial_ending` is an enumerated exception rather than a bypass: it is the only
kind allowed to exceed the unrequested ceiling, it fires at most once per
trial, and it still respects quiet hours.

### Arbitration

One function, `arbitrate(userId, now)`, is the only thing permitted to
authorise an unrequested push. Everything else proposes.

```
ceiling      2 unrequested per rolling 7 days
daily cap    1 per rolling 24 hours, across all buckets
quiet hours  08:00–21:00 in notificationPreferences.timezone
kind cap     at most 1 of any single kind per 7 days
```

Priority when more than one is eligible. The loser does not queue; it expires
and is reconsidered on its own next trigger.

| Rank | Kind           | Why                                              |
| ---: | -------------- | ------------------------------------------------ |
|    1 | `trial_ending` | Time-critical, costs the user money if missed    |
|    2 | `resurfacing`  | Chosen for this moment; least replaceable        |
|    3 | `weekly_shelf` | Scheduled, and still there next week             |
|    4 | `quiet_week`   | Only fires when nothing else has anything to say |

## Non-opening is an uncertain signal

**Platform constraint.** An Expo receipt with status `ok` means the push
service — APNs or FCM — accepted the message. It does not confirm that the
device received it, that the notification was displayed, or that the user saw
it. `notificationDelivery.ts` already says so in `finish`: _"This records
provider acceptance from receipts, not a device read acknowledgment."_

Three reasons a notification goes unopened without the user having rejected
anything:

- The device was off, offline, or in Focus, and the provider dropped or
  coalesced it.
- The user is under **provisional authorization**, where notifications land
  silently in Notification Center with no banner, no sound and no lock-screen
  presence. Non-opening here is close to uninformative.
- They saw it, valued it, and did not need to act.

The previous draft muted a kind automatically after three unopened
notifications. That treats an uncertain signal as proof, and it can silence a
kind a user never saw — most likely exactly for the provisional users we are
trying to convert.

### Progressive cadence reduction

Replace muting with slowing down.

| Consecutive unopened | Response                                                        |
| -------------------: | --------------------------------------------------------------- |
|                    3 | Halve this kind's cadence. Emit `notification_cadence_reduced`. |
|                    6 | Halve again, to a floor of once per quarter.                    |
|                    — | **Never automatically reach zero.**                             |

Only an explicit signal sets `enabled: false`: the **Turn this off** action on
the notification, the Settings switch, or an OS-level disable. Any open resets
the counter.

Users under provisional authorization are **excluded from cadence reduction**
until they upgrade to full authorization, because their non-opening carries
almost no information.

This is deliberately gentler than the previous draft, and the trade is
explicit: it protects against silencing a kind the user never saw, at the cost
of taking longer to quiet a kind that genuinely is not wanted. The explicit
one-tap off action is what covers the second case.

## The catalogue

Four kinds by default. Two user-requested kinds are separate projects
([Appendix](#appendix-two-later-projects)).

### 1. `weekly_shelf` — exists, gets rewritten

- **Trigger** Sunday 09:00 local, the existing `nextWeeklyDigestAt` schedule.
- **Condition** at least 3 `ready` items created in the last 7 days and not
  opened. Keep this floor — it is why this kind has never been annoying.
- **Payload** the newest qualifying item's title plus a count of the rest.
- **Lands on** `/digest/{id}`, unchanged. A contract with shipped clients.
- **Silent when** fewer than 3 qualifying items.

> **Your weekly shelf**
> _"The 12-hour short rib" and 4 more you saved this week._

Every claim there is observable: the title, the count, the save window.

### 2. `quiet_week` — new

The "didn't save anything this week" case, in the Sunday slot the weekly shelf
leaves empty.

- **Trigger** the weekly slot, when `weekly_shelf` did not fire.
- **Condition** **zero** items created in the last 7 days, **and** at least 3
  unopened `ready` items older than 14 days, **and** no `quiet_week` in 21
  days, **and** the account is older than 14 days.
- **Lands on** `/digest/{id}`.
- **Silent when** the shelf is empty, or the user saved anything at all.

The previous draft fired this whenever the shelf had fewer than three _new
unopened_ saves, and described that as the user having saved nothing. Those
are different conditions — a user can save six things and open all of them.
The condition above is the literal one.

> **Still on your shelf**
> _"How to read a balance sheet" — saved in March, not opened yet._

**Hypothesis, not finding:** that framing a quiet week around the shelf
rather than around the user's inactivity produces the same open with less
resentment. We believe reprimanding copy drives uninstalls; we have no Shelvr
data for it. The holdout and the per-kind disable rate are how we find out.

### 3. `resurfacing` — new, the contextual one

An old unopened save, surfaced at a plausible moment.

- **Trigger** scored daily per user; fires at most weekly, above a confidence
  floor.
- **Condition** a `ready`, unopened item older than 14 days scoring above
  threshold.
- **Lands on** `/item/{id}`.
- **Silent when** nothing clears the floor. Expect this most weeks for most
  users; a high fire rate is a bug in the scorer.

Scoring inputs, all already in the schema:

| Signal             | Source                        | Confidence                           |
| ------------------ | ----------------------------- | ------------------------------------ |
| Type and tags      | `items.tags`, `items.type`    | Observable                           |
| Structured recipe  | `items.recipe`                | Observable                           |
| Age, unopened      | `_creationTime`, `itemReads`  | Observable                           |
| Filed into a space | `spaceItems.status = "saved"` | Observable — an explicit user choice |
| Actionable intents | `items.intents`               | Observable                           |
| Anniversary        | `items.capturedAt`            | Observable                           |
| Habitual open hour | derived, see below            | **Hypothesis**                       |

> **Saturday, 4pm**
> _"Miso-braised short ribs" — saved in March, not opened yet._

**On timing.** A user's historical open hours tell us when they have opened
things before. They do not tell us that the user is idle, receptive, or
bored. Treating a past-behaviour distribution as a present mental state is
the exact overreach this document is trying to avoid. Send into the habitual
window because it is the best available guess, label it a hypothesis, and let
the holdout say whether it beats a fixed Saturday-morning schedule.

**Implementation note.** PostHog is not queryable from Convex at request
time, so habitual timing needs an aggregate maintained in Convex. `itemReads`
records `firstOpenedAt`/`lastOpenedAt` but overwrites on re-open and keeps no
distribution. This needs a new per-user hour-of-week histogram incremented in
`markItemOpened`, with a decay, and a minimum sample — on the order of 20
opens — below which the scorer falls back to a fixed schedule. That is real
work, not a free signal.

### 4. `trial_ending` — new

- **Trigger** `subscriptions.expiresAt` minus 24 hours, `status = "trialing"`.
- **Condition** once per trial. Respects quiet hours; exempt from the
  unrequested ceiling as an enumerated exception.
- **Lands on** `/paywall`.

> **Your trial ends tomorrow**
> _You saved 34 things in 7 days._

### 5. `reading_time` — new, opt-in, off by default

The rung-one answer to [Interrupting a scroll](#interrupting-a-scroll).

- **Trigger** a time of day the user picks, on the days they pick.
- **Condition** at least one unopened `ready` link that has an extracted
  article body. Prefers shorter reads.
- **Payload** the item's title and an estimated reading time.
- **Lands on** `/item/{id}`.
- **Silent when** nothing unopened qualifies. It never substitutes a photo or
  a recipe for a nudge the user asked to be about reading.
- **Bucket** user-requested. Off by default; counts against the combined
  one-per-day requested cap.

> **Something you saved**
> _"How to read a balance sheet" — about 4 minutes._

The reading estimate is computed, not guessed: `items.content` already holds
the extracted article body, so a word count over a fixed words-per-minute rate
is an observable number. Items without a body have no estimate and are not
used for this kind.

### Not in the push catalogue

**`space_suggestions` — cut.** The previous draft ranked it second, above
resurfacing. It notifies the user that Shelvr organised something and would
like them to come and triage it, which is precisely the case principle 6
rejects, and the draft's own example of a chore was "a space was
recommended". Ranking a housekeeping notification above the contextual one was
not defensible.

Suggestions stay in-app: a count on the Spaces tab and a card inside the
space. Revisit a push only if in-app data shows suggestions systematically go
unseen **and** users who triage them show better retention — and even then it
competes for the same two slots.

| Also not building                     | Why                                                                                                                                       |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Streaks                               | Manufactures obligation                                                                                                                   |
| "You haven't opened Shelvr in 5 days" | Same trigger as `quiet_week`, framed as the user's failure                                                                                |
| "Your save finished processing"       | A chore                                                                                                                                   |
| Save-failed push                      | Not selected this round. A terminal share-sheet failure while backgrounded is invisible, which is a real trust gap — better solved in-app |
| Event reminders from `add_event`      | `intents[].value` holds a title only, no date                                                                                             |
| Standing badge count                  | An unrepayable claim on attention                                                                                                         |

## The empty shelf

Every kind in the catalogue needs unopened saves, so a user with nothing saved
receives nothing at all. The people most likely to churn are the ones the
system is silent toward. That is a real gap, and earlier drafts of this
document did not mention it.

Two facts soften it, both verified. **Onboarding already captures interests** —
the "What do you save?" step in `save-kinds.ts` offers Articles, Recipes,
Products, Home & decor, Travel, Inspiration, Fitness and Videos, and seeds
starter spaces from the answers. And **every user makes one real save during
onboarding**, recorded in `onboardingDemos`, so no account is literally empty.

**A push is the wrong instrument.** A user who has saved nothing in their first
week has an activation problem: they have not learned the share sheet, or they
forgot Shelvr existed at the moment they needed it. A notification saying "you
haven't saved anything yet" cannot teach the share sheet, and it is the same
notification as "you haven't opened Shelvr in 5 days", already on the
do-not-build list above. Activation is fixed in onboarding and in empty states.
If a brand-new user is notified at all, it should be about the demo save they
made, because that one is theirs.

### Using the interest data already captured

The onboarding answers exist and currently only seed spaces. Three uses that
cost little and keep the promise that Shelvr shows a user their own things:

- **Match the demo article to the answer.** Someone who picks Recipes does
  their onboarding save on a recipe, so their single item is relevant from the
  first minute.
- **Rank their own saves.** `resurfacing` and `reading_time` prefer the types
  the user said they save.
- **Write a specific empty state.** "You said you save recipes — here's how to
  grab one from Instagram" lands where activation actually happens.

### Open: does Shelvr ever send content the user did not save?

Raised, not settled, and recorded here so the trade stays visible.

Sending articles Shelvr selected from stated interests would make it a content
recommender. The case against: every notification in this document says _you
chose this_, which is what makes the attention budget defensible and what no
recommendation can claim; it would mean competing on content quality with the
feeds that [Interrupting a scroll](#interrupting-a-scroll) exists to interrupt;
and there is no content pipeline — Shelvr's model classifies what users save
and discovers nothing, so sources, freshness, moderation and licensing would
all be new. The case for is the empty shelf above.

This is a product-direction decision rather than a notification one, and it
belongs to the founder rather than to this document.

## Interrupting a scroll

**User feedback.** A user asked for exactly this: while scrolling Instagram or
TikTok, a nudge to go read something they had saved. This is the first real
user evidence in the document and it raises the idea's priority. It changes
none of the constraints, and it is a stated preference — worth acting on,
not worth treating as proven demand.

The need underneath the request is not "detect TikTok". It is _"I am spending
time on my phone in a way I don't endorse, and I would rather be doing the
thing I chose. Interrupt me."_ That need can be served three ways at wildly
different cost. Build them in order and let each one decide whether the next
is justified.

### Rung 1 — let the user set the time

A switch — **"Nudge me to read something I saved"** — and a time they pick. A
scheduled push naming one unopened article with its reading time. This is the
`reading_time` kind above.

- Ships in R2. No new permission, no Apple approval, no native build.
- Days of work, not months.
- Answers the question we most need answered: **does anyone actually want to
  be interrupted?** How many switch it on, how many open it, how many still
  have it on after four weeks.

Rung 1 is a proxy and the gap is real: a nudge at 9pm arrives whether you are
scrolling or cooking. It cannot test whether catching someone mid-scroll
converts better than catching them at a fixed time. It can test whether the
appetite exists at all, which is the more expensive thing to be wrong about.

### Rung 2 — guess the time

Replace the user-picked hour with their own habitual open hour (R3). Same
mechanism, better aim, still no detection.

### Rung 3 — actually detect it

Screen Time: the precise version, and the only one that arrives while the user
is genuinely in the failure mode. Scoped in the
[Appendix](#screen-time-interception).

### The decision rule

Rung 3 costs an Apple entitlement, a new binary and an app extension, and is
iOS only. Gate it on rung 1:

- **Low opt-in** — few switch it on, or most switch it off within a month. The
  appetite is not there and rung 3 is not justified, whatever one user said.
- **Healthy opt-in, poor opens** — people want the idea and the fixed time is
  wrong. That is precisely what rung 3 fixes, and it is justified.
- **Healthy on both** — rung 3 is an optimisation rather than a rescue. Worth
  doing, lower urgency.

**Start the Apple entitlement request now, in parallel with R1.** It is
paperwork rather than engineering, it is free, approval takes weeks, and it can
be refused. Running it alongside rung 1 means a good rung-1 result is not
followed by a two-month wait, and a refusal tells us early at no cost.

### What the feedback says about the copy

The user said _"read the article you saved"_ — an article, not a photo or a
recipe. Two consequences that carry into every rung:

- **Prefer readable items.** Links with an extracted article body, not images.
- **Lead with the bound.** "About 4 minutes" is what makes the alternative to
  an infinite feed feel finite. **Hypothesis**, and the one most worth testing
  here.

## Permission

Never at launch. `WeeklyNudgeSheet` — once, after the first share-sheet save —
is the right shape and stays.

**Verified:** SDK 57 exposes `allowProvisional` on
`requestPermissionsAsync` and reports `IosAuthorizationStatus.PROVISIONAL`;
`push-notifications.md` already records provisional and ephemeral
authorization as valid for token registration.

```ts
await Notifications.requestPermissionsAsync({
  ios: { allowProvisional: true },
});
```

Provisional notifications arrive with no prompt, delivered quietly to
Notification Center with system **Keep** / **Turn off** buttons. The user
judges the real thing rather than a dialog, and we ask for full authorization
only after they have opened one.

The cost is real: no lock screen, no sound, lower reach, and — as above —
non-opening under provisional carries little information. Whether the reduced
friction outweighs the reduced reach is a **hypothesis**, and the
`provisional` property on the permission and open events is what settles it.
If reach turns out to be severe, fall back to a conventional prompt after the
first opened provisional notification.

Set `provideAppNotificationSettings: true` so iOS links into Shelvr's own
notification settings.

## Preferences

`weeklyShelfEnabled` cannot carry several kinds. Add per-kind state without
breaking shipped clients.

```ts
notificationKinds: defineTable({
  userId: v.string(),
  kind: notificationKindValidator,
  enabled: v.boolean(),
  cadenceStep: v.number(),              // 0 = full, 1 = halved, 2 = quarterly
  consecutiveUnopened: v.number(),
  lastSentAt: v.optional(v.number()),
  lastOpenedAt: v.optional(v.number()),
})
  .index("by_user", ["userId"])
  .index("by_user_and_kind", ["userId", "kind"]),
```

Expand/contract, as `CLAUDE.md` requires:

1. **Expand.** `weeklyShelfEnabled` keeps being written and read exactly as
   today; a write mirrors into the `weekly_shelf` row. `getPreferences` gains
   an optional `kinds` array; `setPreferences` an optional per-kind argument.
2. **Deploy** the backend, then ship the client that reads `kinds`.
3. **Contract** only once the production channel shows no bundle still writing
   the boolean.

In Settings: one switch per kind with a one-line description, a master switch,
and the configured weekly maximum. A kind on reduced cadence says so —
"sending less often because it hasn't been opened" — rather than reading as
off.

### Turning one off from the notification

**Verified:** the push contract supports `categoryId`, and SDK 57 exposes
`setNotificationCategoryAsync(identifier, actions, options)` with
`opensAppToForeground` per action.

| Action            | Behaviour                               |
| ----------------- | --------------------------------------- |
| **Open**          | Default tap, follows `data.url`         |
| **Later**         | Snoozes this kind 7 days, no foreground |
| **Turn this off** | Sets `enabled: false`, no foreground    |

Both background actions need a handler that writes the preference without a
cold start. This matters because the alternative to a one-tap mute is a
one-tap uninstall, and because **Turn this off** is the strong signal that
cadence reduction deliberately does not infer.

## Delivery architecture

### Generalising the outbox

`weeklyDigests` holds both shelf **contents** and **delivery state**. Split
them. Contents stay — `/digest/{id}` and `getDigest` are contracts with every
shipped build.

```ts
notificationOutbox: defineTable({
  userId: v.string(),
  kind: notificationKindValidator,
  payload: notificationPayloadValidator,
  dedupeKey: v.string(),
  collapseId: v.optional(v.string()),
  scheduledFor: v.number(),
  arm: v.optional(v.union(v.literal("notified"), v.literal("holdout"))),
  deliveryStatus: v.optional(v.union(
    v.literal("pending"), v.literal("complete"), v.literal("failed"))),
  deliveryNextAttemptAt: v.optional(v.number()),
  deliveryAttempts: v.optional(v.number()),
  deliveryRecipients: v.optional(v.array(recipientValidator)),
  deliveryError: v.optional(v.string()),
  deliveredAt: v.optional(v.number()),
  openedAt: v.optional(v.number()),
})
  .index("by_user_and_kind", ["userId", "kind"])
  .index("by_dedupe", ["userId", "dedupeKey"])
  .index("by_delivery_status_and_attempt",
         ["deliveryStatus", "deliveryNextAttemptAt"]),
```

### The migration is not a rename

The previous draft called this "a rename plus a payload indirection". It is
not. Four things must survive it:

1. **In-flight scheduled jobs.** `prepareWeeklyDigest` calls
   `ctx.scheduler.runAfter(0, internal.notificationDelivery.send, { digestId })`.
   Jobs already queued at deploy time will fail argument validation if `send`
   stops accepting `digestId`. The repo already has precedent for this —
   `sendDigestNotification` exists purely as "the scheduled entry point used
   by previously deployed code". So `send` must accept **both**
   `{ digestId }` and `{ outboxId }` for at least one release.
2. **In-flight receipt state.** `deliveryRecipients` holds
   `state: "receipt"` entries with Expo `ticketId`s awaiting a poll. Dropping
   them either loses deliveries or re-sends them. The backfill must copy
   `deliveryRecipients`, `deliveryAttempts`, `deliveryNextAttemptAt` and
   `deliveryStatus` verbatim, not reset them.
3. **Exactly-once claiming across two tables.** `recover` sweeps
   `by_delivery_status_and_attempt` on `weeklyDigests`. During migration both
   tables need sweeping, and a row must not be claimable from both. Mark
   migrated rows with a `migratedToOutboxId` field and have the legacy sweep
   skip them.
4. **Bounded batches.** Run the backfill as a chained, paginated internal
   mutation in the style of `prepareDueWeeklyDigests` and
   `cleanupStaleImageImports` — never a single scan.

Order: expand `send` → deploy → backfill → switch writers → contract. The
claim/finish/recover logic itself is genuinely kind-agnostic and carries over;
it is the cutover that needs care.

`dedupeKey` makes retries and racing crons safe, in the spirit of the existing
`itemOperations` ledger.

### Payload

Verified against the `ExpoPushMessage` type in `expo-server-sdk`:

```ts
{
  to: token,
  title, body,
  data: { url, kind, notificationId },
  categoryId: `shelvr.${kind}`,
  collapseId,                               // replaces an undelivered message
  tag,                                      // replaces a displayed Android one
  threadId: "shelvr",
  interruptionLevel: "passive",             // "active" only for trial_ending
  channelId,
  ttl,
}
```

**`collapseId` and `tag` are not interchangeable.** `collapseId` maps to the
provider collapse key and replaces a message that has **not yet been
delivered**. `tag` is what replaces a notification **already posted** in the
Android tray. Set both; they are separate fields in the push contract.

`interruptionLevel: "passive"` for every default kind — passive notifications
do not wake the screen, which is correct for a product whose premise is that
nothing here is urgent.

One Android channel per kind, so Android users can mute a kind at OS level.
Batch in chunks of 100, the documented `pushNotificationChunkLimit`.

### Rich images need a native extension

**Verified:** `expo-notifications` 57.0.17 contains no Notification Service
Extension. Its config plugin is `withNotificationsIOS` and
`withNotificationsAndroid` only — sounds, icons, entitlements, channels. A
search of the package for `UNNotificationServiceExtension` returns nothing.

**Platform constraint:** displaying a remote image on an iOS push requires
`mutable-content: 1` **and** a Notification Service Extension inside the app
that downloads the image and attaches it. Expo's push service can set the
flag; it cannot supply the extension.

So `richContent: { image }` is not a copy improvement. It needs a new iOS
target, a custom config plugin, a fingerprint change and a new binary. It
moves out of the first release and into its own piece of work, and the first
release ships text-only notifications — which is fine, because naming the item
is where most of the value is.

### Copy and localization

New kinds extend `convex/model/notificationTranslations.json`, which carries
nine catalogs and shares `make-plural` rules with the app via
`convex/model/localization.ts`. Per `docs/architecture/localization.md`: every
plural variant carries `%{formattedCount}`, every required CLDR category is
present, and fragments are never concatenated around a count.

Interpolating an item title sends **user content to Expo, APNs and FCM**. That
is a deliberate exception to the repo's "keep user content out of log fields"
rule, confined to notification bodies: titles never enter `logEvent` fields or
PostHog properties. Titles truncate at 60 characters on a word boundary, and
items with `status: "failed"` or `enrichment: "partial"` are never the named
item, because their titles are guesses.

## Rollout

### R1 — Instrument and establish a baseline

**Ships no new notification kinds.**

- All eight analytics events.
- `"notification"` added to the `item_opened` source allowlist; attribution
  property on `item_action`.
- `notification-outcomes.sql` and its dashboard tile.
- Holdout assignment, applied to the weekly shelf.
- Weekly shelf copy rewritten to name the newest save. Text only.

**Exit:** the dashboard reports, for the weekly shelf, accepted → opened →
notification-useful return, split by arm and by authorization type, on a
matured cohort.

**Running alongside, not blocking:** file the Apple `FamilyControls`
entitlement request. Paperwork, not engineering; weeks of waiting; may be
refused. Starting it now is what stops a good rung-one result in R2 from
stalling for two months.

### R2 — Budget, controls, and one experiment

- Outbox generalisation, with the migration sequence above.
- Per-kind preferences (expand step), category actions, per-kind channels.
- The shared budget and `arbitrate`.
- Progressive cadence reduction.
- `quiet_week`.
- **One** deterministic `resurfacing` experiment, holdout-controlled, on a
  fixed schedule — no habitual-hour timing yet.
- `reading_time` — rung one of [Interrupting a scroll](#interrupting-a-scroll).
  Opt-in, user-scheduled, off by default.

**Exit:** the notified arm beats the holdout on useful returns per user per
week, for at least one kind. If it does not, stop and reconsider rather than
proceeding.

### R3 — Refinement

- Habitual-hour timing, with the Convex-side histogram, tested against R2's
  fixed schedule.
- `trial_ending`.
- Notification Service Extension and rich images, if R1/R2 justify the binary.

### Later, separate projects

Geofencing and Screen Time interception are scoped in the
[Appendix](#appendix-two-later-projects). Both need new native binaries, new
permissions and store declarations, so neither ships inside R1–R3.

They are no longer equally speculative, though. **Geofencing has no user
asking for it** and rests on data we would first have to create by geocoding
`open_maps` intents. **Screen Time has a user asking for it**, and a cheap
in-plan experiment — `reading_time` in R2 — that decides whether to build it.
Treat geofencing as research and Screen Time as gated work whose entitlement
paperwork is already moving.

Each release respects the deploy order in `CLAUDE.md`: the Convex deploy lands
before the client update that needs it, public shapes expand before clients
move, and nothing contracts until the production channel shows no old bundle
calling it.

## Appendix: two later projects

Research retained because it is load-bearing for scoping. Geofencing is not
scheduled. Screen Time is gated on the rung-one result in R2 — see
[The decision rule](#the-decision-rule).

### Places and geofencing

**The data we have is the wrong data.** `items.latitude/longitude` is EXIF GPS
from the user's own photos — where they were, which is a memory, not an
errand. The right signal is already in the schema and unused: `intents` of
kind `open_maps` carry a place or address string, produced by the classifier
for exactly those saves that are about going somewhere. Geocoding those is a
prerequisite; without it the feature is noise.

That geocoding needs a provider and a new deployment variable.
`GOOGLE_MAPS_API_KEY` exists for the Android map, but Google's Geocoding terms
restrict storing results — confirm or price an alternative before committing.

**Platform constraints.** iOS monitors **20 regions per app, hard**; Android 100. iOS needs `Always` location and
`NSLocationAlwaysAndWhenInUseUsageDescription`; Android needs
`ACCESS_BACKGROUND_LOCATION` plus a Play declaration **and a demo video**.
`expo-location` provides `startGeofencingAsync(taskName, regions)`,
`LocationRegion`, `GeofencingEventType.Enter` and
`requestBackgroundPermissionsAsync` — verified against the package types.

Design within 20 regions: monitor 19 places plus one large perimeter region
(5–20 km); exiting the perimeter triggers reselection. Rank by unopened,
recency, space membership, `open_maps` origin over EXIF, and distance from the
user's centre of mass. Firing rules: enter only, one per day, same place never
twice in 30 days, quiet hours, ~60 s dwell so driving past does not fire.

Copy states only what is observable:

> **You're near Kiln**
> _You saved it in June._

Not "and never went" — an unopened save is not evidence of a missed visit.

### Screen Time interception

**Status:** wanted by a user, gated on `reading_time`'s opt-in and open rates
in R2, entitlement request filed during R1. Not scheduled until the gate
passes.

Apple's `FamilyControls` / `DeviceActivity` / `ManagedSettings` stack.
`react-native-device-activity` (0.6.1, February 2026, peer `expo >= 52`) wraps
it with `requestAuthorization`, `DeviceActivitySelectionView`,
`startMonitoring`, `onDeviceActivityMonitorEvent` and a `sendNotification`
action — verified against the package's types.

Four constraints that shape any estimate:

- **`com.apple.developer.family-controls` requires Apple's approval** for
  distribution. Weeks, and the critical path.
- **A new native binary** — config plugin, `DeviceActivityMonitor` app
  extension, App Group. Not OTA-able; changes the fingerprint.
- **The extension has no network and no JS runtime.** It cannot choose an item
  when it fires, so the app must pre-stage a candidate into the shared App
  Group container on every foreground. A stale or empty interruption is worse
  than none. The candidate follows the same rule as `reading_time`: a readable
  article with a computed reading time, never a photo.
- **No Android equivalent.** `UsageStatsManager` needs the special
  `PACKAGE_USAGE_STATS` grant, which Play restricts to apps whose core purpose
  is usage management.

Apple's picker keeps the chosen apps opaque — Shelvr never learns which apps
they are — which is what makes this defensible to ship at all.

Copy substitutes rather than reprimands, and claims nothing about the user's
state of mind:

> **Something you saved**
> _"Miso-braised short ribs" — 4 minutes._

**Hypothesis:** that a bounded alternative ("4 minutes") competes with an
unbounded feed better than an unbounded one does. Untested.

Shelvr does not shield or block the other app, though `ManagedSettings` would
allow it. Blocking makes Shelvr an adversary of the user's own phone; offering
makes it an alternative.

## Open questions

1. **Attribution undercount.** Lineage attribution will miss users who return
   later by another route. Size it in R1 by comparing against a time-window
   measure reported alongside, and report both.
2. **Does `resurfacing` need the model?** The scorer is deterministic and uses
   existing fields. A `gemini-3.1-flash-lite` pass might pick better at a
   per-user-per-week cost. Ship deterministic, measure, then decide.
3. **Geocoding provider terms.** Blocks the places project, not this plan.
4. **Does Shelvr ever send content the user did not save?** See
   [The empty shelf](#the-empty-shelf). The largest open question here, because
   it decides what the product is rather than how it notifies.
5. **How widely is the interruption wanted?** One user asked for it. Before R2
   is scoped it is worth asking a handful more, and worth asking specifically
   whether they would keep it on after a fortnight — the failure mode for this
   feature is enthusiastic adoption followed by quiet disabling, which looks
   like success for the first two weeks.
