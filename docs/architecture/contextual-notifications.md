# Contextual notifications

What Shelvr sends, when it sends it, and how it is built. This is the design
decision record for the notification system as a whole; the existing
[push notification builds and updates](push-notifications.md) stays the
reference for credentials, EAS profiles, and OTA fingerprints.

Status: specification. Nothing here is implemented beyond the weekly shelf
described under [What exists today](#what-exists-today).

## The decision in one paragraph

Shelvr may send **at most two pushes per week and at most one per day**, to
every user, across every notification kind, enforced server-side in one place.
Adding a notification kind never adds volume — kinds compete for the same two
slots through a priority ladder. Every notification names a specific thing the
user saved; none of them says "you have 5 unread items". A kind that a user
ignores three times running mutes itself. Two on-device kinds (arriving at a
place they saved, and an opt-in interruption while they are scrolling
something else) sit outside the push budget because the user's own movement or
their own explicit request triggers them — but they carry their own caps and
the same quiet hours.

## Principles

These exist to settle future arguments without re-litigating them.

1. **A notification is a claim on attention that has to be repaid.** The test
   for shipping one is not "would this get opened" but "would the user, a week
   later, be glad it arrived".
2. **Name the thing.** Every body text references a real save — its title, its
   image, its site. Counting is not context. `3 saves waiting for you` is the
   copy we are replacing.
3. **Contextual means better-chosen, not more.** The budget is fixed before the
   catalogue is designed, so every new idea has to beat an existing kind rather
   than add to it.
4. **Silence is a valid output.** Every kind has a condition under which it
   sends nothing, and no kind may substitute filler to occupy its slot.
5. **Never notify about the app's own housekeeping.** Classification finished,
   an item was enriched, a space was recommended — these are chores, not news.
6. **Learn from being ignored.** Ignoring is the clearest feedback signal the
   product ever gets, and it must reduce volume automatically.
7. **The user can turn one thing off without turning everything off.** One bad
   kind must not cost us the channel.

## What exists today

| Piece                         | State                                                                |
| ----------------------------- | -------------------------------------------------------------------- |
| Expo Push, APNs, FCM v1       | Working, documented in `push-notifications.md`                       |
| `notificationDevices`         | One token per device, ownership guarded against takeover             |
| `notificationPreferences`     | A single `weeklyShelfEnabled` boolean, `nextDigestAt`, `timezone`    |
| `weeklyDigests`               | Persisted shelf contents plus its whole delivery state               |
| `notificationDelivery.ts`     | claim / finish / recover, 8 attempts, receipts, backoff, dead-letter |
| `crons.ts`                    | Hourly `prepareDueWeeklyDigests`, 5-minute delivery recovery         |
| `model/notificationFields.ts` | `digestCopy` and nine locale catalogs                                |
| `itemReads`                   | Per-user read state, already the digest's unread filter              |
| Deep links                    | `data.url` routed by `useNotificationObserver` into `nav.push`       |
| Android channel               | `weekly-shelf`, created client-side in `notification-token.ts`       |
| Opt-in prompt                 | `WeeklyNudgeSheet`, once, after the first share-sheet save           |

The delivery machine is the strongest part of this system and the design below
reuses it rather than replacing it. The gaps are elsewhere:

- **One kind, one switch.** A second kind hung off `weeklyShelfEnabled` means
  one bad notification costs us every notification.
- **No measurement at all.** There is no PostHog event for a permission
  prompt, a send, a delivery, or an open. `markDigestOpened` writes a
  timestamp to Convex that nothing ever reads back into analytics. We cannot
  tune what we cannot see, so this is the first thing to fix.
- **Notification opens are invisible in the north-star metric.**
  `analytics.ts` allowlists `item_opened.source` to `home`, `space` and
  `search` and collapses everything else to `direct`, so an open that came
  from a notification is indistinguishable from any other. One string in that
  allowlist makes the whole existing useful-returns query segmentable by
  notification.
- **No budget.** Nothing would stop two kinds landing in the same hour.
- **Generic copy.** `digestCopy` interpolates a count and nothing else.

Two constraints worth stating early, because they kill otherwise good ideas:
`intents` of kind `add_event` carry **only an event title, never a date**, so
honest time-based event reminders are impossible without a schema change; and
`items.latitude/longitude` is **EXIF GPS from photos the user shot**, which
records where they were, not where they intend to go.

## The budget

One function, `arbitrate(userId, now)`, is the only thing in the codebase
allowed to authorise a push. Everything else proposes.

```
ceiling      2 push notifications per rolling 7 days
daily cap    1 push per rolling 24 hours
quiet hours  send only between 08:00 and 21:00 in notificationPreferences.timezone
kind cap     at most 1 of any single kind per 7 days
```

**Priority ladder**, applied when more than one kind is eligible in the same
window. Highest wins the slot; the rest do not queue up behind it, they expire
and are reconsidered on their own next trigger.

| Rank | Kind                | Why it outranks the one below                        |
| ---: | ------------------- | ---------------------------------------------------- |
|    1 | `trial_ending`      | Time-critical and costs the user money if missed     |
|    2 | `space_suggestions` | Shelvr already did the work; it is sitting unclaimed |
|    3 | `resurfacing`       | The contextual pick, chosen for this moment          |
|    4 | `weekly_shelf`      | Scheduled, and still there next week if skipped      |
|    5 | `quiet_week`        | Only fires when nothing else has anything to say     |

The two device-originated kinds (`nearby_place`, `intercept`) do not draw from
this budget — see [Budget across two origins](#budget-across-two-origins).

### Self-quieting

Per user, per kind: three consecutive notifications that were **delivered and
not opened within 72 hours** mute that kind for 30 days. A second strike after
the mute lifts turns the kind off until the user re-enables it in Settings.
Opening resets the counter to zero.

This is the single highest-leverage mechanism in the design. It means a kind
that turns out to be worthless costs each user three notifications, not an
indefinite stream, and it means we can ship a kind we are unsure about.

## The catalogue

Six kinds plus the two device-originated ones. Each specifies its trigger, what
is in the payload, where it lands, and — the part that usually gets skipped —
when it stays silent.

### 1. `weekly_shelf` — exists, gets rewritten

- **Trigger** Sunday 09:00 local, the existing `nextWeeklyDigestAt` schedule.
- **Condition** at least 3 `ready` items created in the last 7 days that the
  user has not opened. Keep this floor. It is what stops light users being
  notified about nothing, and it is why this kind has never been annoying.
- **Payload** the newest qualifying item's title, its `heroImageUrl` as
  `richContent.image`, and a count of the rest.
- **Lands on** `/digest/{id}` — unchanged, and a public contract with shipped
  clients.
- **Silent when** fewer than 3 qualifying items. The slot then falls through to
  `quiet_week`.

Copy moves from counting to naming:

> **Your weekly shelf**
> _"The 12-hour short rib" and 4 more you saved this week._

### 2. `quiet_week` — new, requested

The "didn't save anything this week" case. It is the **same Sunday slot** as
the weekly shelf, taken only when the shelf has nothing, so it costs zero
additional budget — which is the reason it is affordable at all.

- **Trigger** the weekly slot, when `weekly_shelf` found fewer than 3 new
  unopened saves.
- **Condition** the user has at least 3 unopened `ready` items **older than 14
  days**, and has not been sent `quiet_week` in 21 days.
- **Payload** three old unopened saves, oldest-first, preferring items that
  belong to a space (evidence the user cared enough to file them).
- **Lands on** `/digest/{id}`, reusing the digest view with a different title.
- **Silent when** the shelf is genuinely empty, or the user is in their first
  14 days.

**The copy does not mention the user's inactivity.** "You haven't saved
anything in a week" is a reprimand, and reprimands are what get apps deleted.
The same trigger, framed as service:

> **Still on your shelf**
> _"How to read a balance sheet" — saved in March, never opened._

This is a deliberate reinterpretation of the request. The trigger is exactly
what was asked for: a user who saved nothing for a week gets a notification.
What changed is that the notification is about their shelf rather than about
their behaviour, because the behavioural framing reliably produces churn and
the shelf framing produces the same open with none of the resentment.

### 3. `resurfacing` — new, the genuinely contextual one

An old unopened save, matched to a moment. This is the kind that moves the
existing useful-returns metric and the one worth most of the engineering.

- **Trigger** the candidate scorer runs daily per user; fires at most once a
  week and only when it clears a confidence floor.
- **Condition** a `ready`, unopened item older than 14 days that scores above
  threshold for _this_ hour of _this_ day.

Scoring inputs, all already in the schema:

| Signal             | Source                                | Use                                                                    |
| ------------------ | ------------------------------------- | ---------------------------------------------------------------------- |
| Item type and tags | `items.tags`, `items.type`            | A recipe wants Saturday afternoon; a long read wants a weekday evening |
| Structured recipe  | `items.recipe`                        | The strongest single "this is a weekend thing" signal we hold          |
| Age and unread     | `_creationTime`, `itemReads`          | Old and never opened is the whole point                                |
| Filed into a space | `spaceItems` where `status = "saved"` | The user chose to keep it; weight it up                                |
| Actionable intents | `items.intents`                       | An item with a real next action is worth a nudge                       |
| Personal rhythm    | `item_opened` history                 | The user's own habitual open window, not a global guess                |
| Anniversary        | `items.capturedAt`                    | A photo from a year ago today                                          |

- **Lands on** `/item/{id}`.
- **Silent when** nothing clears the floor. Expect this to be most weeks for
  most users, and treat a high fire rate as a bug in the scorer.

> **Saturday, 4pm**
> _"Miso-braised short ribs" has been on your shelf since March._

**Personal rhythm beats a global schedule.** The user's own `item_opened`
distribution tells us when they actually read things. Sending into that window
is most of the value of the word "contextual" and costs no new permission, no
native module and no store review. Build this before anything that needs an
entitlement.

### 4. `space_suggestions` — new

Shelvr's AI filed candidates into a dynamic space and they are sitting
untriaged. This is the one case where the product genuinely did work on the
user's behalf and needs them to come and claim it.

- **Trigger** daily evaluation.
- **Condition** one space has at least 5 `suggested` memberships, the oldest is
  at least 3 days old, and the user has not opened that space since they were
  created.
- **Payload** the space name, the suggestion count, and the top suggestion's
  image.
- **Lands on** `/space/{id}`.
- **Silent when** the user triaged anything in that space in the last 3 days —
  they are already on it.

> **12 picks for "Apartment shopping"**
> _Shelvr matched these from things you'd already saved._

### 5. `trial_ending` — new

- **Trigger** `subscriptions.expiresAt` minus 24 hours, `status = "trialing"`.
- **Condition** fires once per trial, and **ignores the weekly ceiling** — it
  is a billing fact, not a content pick — but still respects quiet hours.
- **Lands on** `/paywall`.
- **Silent when** the user already converted.

This is the one kind where the honest move is to be plain. It also carries a
count of what they saved during the trial, which is both the truest argument
for converting and a genuine reminder of what they'd lose.

> **Your trial ends tomorrow**
> _You saved 34 things in 7 days. Keep them coming._

### 6. `nearby_place` — new, device-originated

Covered in [Geofencing](#geofencing).

### 7. `intercept` — new, device-originated, iOS only

Covered in [Interrupting a scroll](#interrupting-a-scroll).

### Deliberately not building

| Not building                          | Why                                                                                                                                                                                                     |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Streaks, "don't break your run"       | Manufactures obligation. The fastest route to an uninstall.                                                                                                                                             |
| "You haven't opened Shelvr in 5 days" | Same trigger as `quiet_week`, but framed as the user's failure. Ship the shelf framing instead.                                                                                                         |
| "Your save finished processing"       | The app did a chore. Nobody is waiting for that.                                                                                                                                                        |
| Save-failed push                      | Not selected for this round. A terminal share-sheet failure stays invisible while the app is backgrounded, which is a real trust gap — worth revisiting as an in-app repair surface rather than a push. |
| Event reminders from `add_event`      | `intents[].value` holds an event **title only**, no date. Cannot be built honestly without a schema change.                                                                                             |
| Badge counts as a standing nag        | A permanent red dot is an unrepayable claim on attention. Badge only alongside a real notification, cleared on open.                                                                                    |

## Measurement

Build this first. It is the cheapest phase and every later decision depends on
it.

### Events

| Event                               | Origin                  | Fields                                        |
| ----------------------------------- | ----------------------- | --------------------------------------------- |
| `notification_permission_requested` | client                  | `trigger`, `provisional`                      |
| `notification_permission_result`    | client                  | `status`, `provisional`                       |
| `notification_sent`                 | Convex                  | `kind`, `notification_id`                     |
| `notification_delivered`            | Convex, on receipt `ok` | `kind`, `notification_id`, `latency_ms`       |
| `notification_suppressed`           | Convex                  | `kind`, `reason`                              |
| `notification_opened`               | client                  | `kind`, `notification_id`, `action`, `age_ms` |
| `notification_action`               | client                  | `kind`, `action`                              |
| `notification_kind_muted`           | Convex                  | `kind`, `reason`                              |

`reason` on suppression is a closed set — `budget`, `quiet_hours`,
`kind_muted`, `user_disabled`, `no_content`, `no_devices` — so the funnel
between "eligible" and "sent" is visible rather than inferred.

All of it is categorical. Item titles and space names go into notification
**bodies** but never into event properties, matching the existing rule in
`CLAUDE.md`.

### Attribution to the north-star metric

`docs/analytics/README.md` already defines a **useful return**: a reopen in a
later session followed by a `copy` or confirmed `share` of the same item, both
within 7 days of the save. That same document closes by saying "AI-inferred
purpose and contextual resurfacing remain the next phase; this establishes the
baseline for evaluating them". This spec is that phase, and it should be
judged by that metric rather than by open rate.

One change makes that possible. `analytics.ts` line 247 currently reads:

```ts
source: ["home", "space", "search"].includes(source) ? source : "direct",
```

Add `"notification"` to the allowlist and pass it from the notification
response handler. `useful-returns.sql` then segments by source with no query
change, and the question becomes answerable: **does an item opened from a
notification produce a useful return at the same rate as one opened
organically?** If it does not, the notification is borrowing attention rather
than creating value, and the kind should be cut regardless of its open rate.

Per-kind success criteria, evaluated on mature cohorts:

- Open rate within 72 hours ≥ 15%.
- Notification-sourced useful-return rate ≥ 70% of the organic rate.
- Per-kind mute rate < 5%.
- Notification-attributable permission revocations ≈ 0.

A kind that misses these for two consecutive months is removed, not tuned.

## Permission

Never at launch. The current `WeeklyNudgeSheet` — asking once after the first
share-sheet save — is already the right shape and stays.

**Use iOS provisional authorization for the first ask.** SDK 57 exposes
`allowProvisional` on `requestPermissionsAsync` and reports
`IosAuthorizationStatus.PROVISIONAL`, and `push-notifications.md` already
records that provisional and ephemeral authorization are valid for token
registration.

```ts
await Notifications.requestPermissionsAsync({
  ios: { allowProvisional: true },
});
```

Provisional notifications arrive with no permission prompt at all, delivered
quietly to Notification Center with **Keep** / **Turn off** buttons attached by
the system. The user judges the real thing instead of a dialog. We then ask for
full authorization only after they have opened one — at which point the ask is
backed by evidence rather than a promise.

The cost is honest: provisional notifications do not appear on the lock screen
and make no sound, so reach is lower until a user upgrades. For a weekly,
low-urgency product this is the right trade, and the open-rate difference
between provisional and full authorization is exactly what the events above
will show.

Set `provideAppNotificationSettings: true` as well, so iOS surfaces a link
straight into Shelvr's own notification settings from the system settings page.

## Preferences

`weeklyShelfEnabled` is a boolean and cannot carry seven kinds. Replace it with
per-kind state, without breaking shipped clients.

New table, one row per user per kind:

```ts
notificationKinds: defineTable({
  userId: v.string(),
  kind: notificationKindValidator,   // closed union, one place
  enabled: v.boolean(),
  mutedUntil: v.optional(v.number()),
  consecutiveIgnored: v.number(),
  lastSentAt: v.optional(v.number()),
  lastOpenedAt: v.optional(v.number()),
})
  .index("by_user", ["userId"])
  .index("by_user_and_kind", ["userId", "kind"]),
```

Expand/contract, as `CLAUDE.md` requires for every public function:

1. **Expand.** Keep `weeklyShelfEnabled` written and read exactly as today.
   `getPreferences` gains an optional `kinds` array; `setPreferences` accepts
   an optional per-kind argument. Old clients keep working unchanged, and a
   write to `weeklyShelfEnabled` mirrors into the `weekly_shelf` row.
2. **Deploy** the backend, then ship the client that reads `kinds`.
3. **Contract** only once the production channel shows no bundle still writing
   the boolean.

In the app, the Settings row becomes a section: one switch per kind, each with
one line of plain description, plus a master switch. A muted kind shows _why_
("paused because it went unopened") rather than silently reading as off.

### Turning one off from the notification itself

The push contract supports `categoryId`, and SDK 57 exposes
`setNotificationCategoryAsync(identifier, actions, options)`. Register one
category per kind with:

| Action            | Behaviour                                                   |
| ----------------- | ----------------------------------------------------------- |
| **Open**          | Default tap, follows `data.url`                             |
| **Later**         | Snoozes this kind for 7 days, `opensAppToForeground: false` |
| **Turn this off** | Disables this kind, `opensAppToForeground: false`           |

Both non-opening actions need a background handler that writes the preference
without a cold start. This is the humane half of the design: a user who is
mildly irritated should be able to act on it in one tap, in the moment, rather
than hunting through Settings — and the alternative to a one-tap mute is a
one-tap uninstall.

## Delivery architecture

### Generalising the outbox

`weeklyDigests` currently holds both the **contents** of a shelf and its
**delivery state**. Split them. The contents stay — `/digest/{id}` and
`getDigest` are contracts with every shipped build and must not move. Delivery
moves to a table that any kind can use.

```ts
notificationOutbox: defineTable({
  userId: v.string(),
  kind: notificationKindValidator,
  payload: notificationPayloadValidator,   // discriminated by kind
  dedupeKey: v.string(),                   // e.g. "weekly_shelf:2026-09-20"
  collapseId: v.optional(v.string()),
  scheduledFor: v.number(),
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

`notificationDelivery.ts` then generalises from `digestId` to `outboxId`. Its
claim / finish / recover machine, its 8-attempt cap, its receipt polling and
its `DeviceNotRegistered` handling are all kind-agnostic already and carry
over untouched — this is a rename plus a payload indirection, not a rewrite.
`weeklyDigests` keeps its delivery columns until the contract step retires
them.

`dedupeKey` is what makes retries and racing crons safe, in the same spirit as
the existing `itemOperations` ledger. `collapseId` means a new resurfacing
notification **replaces** an unopened older one on the lock screen rather than
stacking beneath it.

### Payload

Verified against the Expo push contract shipped in `expo-server-sdk`:

```ts
{
  to: token,
  title, body,                              // localized per recipient
  data: { url, kind, notificationId },
  richContent: { image: heroImageUrl },     // the save's own image
  categoryId: `shelvr.${kind}`,             // action buttons
  collapseId,                               // replaces, not stacks
  threadId: "shelvr",                       // groups in Notification Center
  interruptionLevel: "passive" | "active",  // passive for all content kinds
  channelId,                                // one Android channel per kind
  badge, sound, ttl,
}
```

`interruptionLevel: "passive"` for every content kind. Passive notifications do
not wake the screen — correct for a product whose entire premise is that
nothing here is urgent. `trial_ending` is the only `"active"` one.

One Android channel per kind (`weekly-shelf` already exists), because Android
users manage notifications per channel and a single channel would make "mute
the resurfacing ones" impossible at the OS level.

Batch sends in chunks of 100, the documented `pushNotificationChunkLimit`.

### Copy and localization

New kinds extend `convex/model/notificationTranslations.json`, which already
carries nine catalogs and shares `make-plural` rules with the app via
`convex/model/localization.ts`. Per `docs/architecture/localization.md`: every
plural variant carries `%{formattedCount}`, every CLDR category required by
the locale is present, and translated fragments are never concatenated around
a count.

Interpolating an item title means **user content travels to Expo, APNs and
FCM**. That is a deliberate exception to the repo's "keep user content out of
log fields" rule, and it is confined to notification bodies: titles never enter
`logEvent` fields or PostHog properties. Titles are truncated to 60 characters
on a word boundary, and items with `status: "failed"` or
`enrichment: "partial"` are never used as the named item, since their titles
are guesses.

### Budget across two origins

Server-sent pushes and device-fired local notifications cannot share a single
counter, because a geofence crossing or a scroll threshold fires with no
guaranteed network.

- **Convex holds the authority.** One `notificationBudget` row per user:
  rolling counters, `lastSentAt`, and the local-origin counts most recently
  reconciled from devices.
- **The device holds a conservative mirror.** Local kinds decrement a mirror
  in device storage before firing, and reconcile on next foreground.
- **Drift is allowed in exactly one direction.** If the device cannot tell
  whether it has budget, it does not fire. Under-notifying is a smaller
  failure than double-notifying, and a stale mirror must never be able to
  spend the server's budget.

The two local kinds have separate caps — 1 per day for `nearby_place`, a
user-chosen 1–4 per day for `intercept` — because both are triggered by the
user's own movement or their own standing request, not by us deciding to
interrupt. They still obey quiet hours and the same self-quieting rule.

## Geofencing

Selected for scope. Building it well means fixing the data first, because the
data we currently have is the wrong data.

### The signal problem, and the fix

`items.latitude/longitude` is EXIF GPS from photos the user shot. It records
**where they were**, not where they intend to go. A geofence on it fires when
someone walks past a place they have already been — which is a memory, not an
errand, and memories do not need a notification.

The right signal is already in the schema and unused: **`intents` of kind
`open_maps` carry a place or address string**, produced by the classifier for
exactly those saves that are about going somewhere. A restaurant the user
saved from TikTok has one. Geocoding those turns "somewhere I photographed"
into "somewhere I meant to go", which is the difference between this feature
working and being noise.

```ts
itemPlaces: defineTable({
  userId: v.string(),
  itemId: v.id("items"),
  latitude: v.number(),
  longitude: v.number(),
  label: v.string(),
  source: v.union(
    v.literal("exif"),            // photo GPS — weakest, memory not errand
    v.literal("open_maps_intent"), // geocoded intent — strongest
    v.literal("link_metadata"),    // place markup on the saved page
  ),
  geocodedAt: v.number(),
})
  .index("by_user", ["userId"])
  .index("by_item", ["itemId"]),
```

Geocoding runs in `ai.ts` after classification, for items that produced an
`open_maps` intent. It needs a geocoding provider and a new deployment
variable; `GOOGLE_MAPS_API_KEY` already exists for the Android map and its
Geocoding API is the least-new-surface option. Rate-limit it on the same
per-user token bucket pattern as `findLinks`.

### Platform limits

| Constraint                | iOS                                            | Android                                                    |
| ------------------------- | ---------------------------------------------- | ---------------------------------------------------------- |
| Monitored regions per app | **20, hard**                                   | 100                                                        |
| Permission                | `Always`, two-step                             | `ACCESS_BACKGROUND_LOCATION`                               |
| Store requirement         | `NSLocationAlwaysAndWhenInUseUsageDescription` | Play background-location declaration **plus a demo video** |
| Minimum radius            | ~100 m reliable                                | ~100 m reliable                                            |

`expo-location` provides what is needed:
`startGeofencingAsync(taskName, regions)` with `LocationRegion`
(`latitude`, `longitude`, `radius`, `notifyOnEnter`, `notifyOnExit`), a
`TaskManager` task receiving `GeofencingEventType.Enter`, and
`requestBackgroundPermissionsAsync`.

### Working within 20 regions

Twenty is a hard cap on iOS and the design has to be built around it rather
than discover it late.

- Monitor **19 places plus one perimeter region** — a large circle (5–20 km)
  around the current cluster. Exiting the perimeter is the signal to recompute
  the 19, which is how a fixed cap covers an unbounded set of places.
- Rank candidates by: unopened, recency of save, filed into a space,
  `source = "open_maps_intent"` over `exif`, and distance from the user's
  centre of mass.
- Selection lives server-side as a query returning ≤20 regions, so it can be
  recomputed when the user saves something new. The client calls
  `startGeofencingAsync` with whatever it returns.
- Radius 150 m default, clamped 100–500 m; wider for a neighbourhood, tighter
  for an address.

### Firing rules

Deliberately strict, because a geofence notification arrives when the user is
out in the world and mildly busy:

- Enter only, never exit.
- The place must be **unopened** or carry an unexecuted `open_maps` intent.
- One `nearby_place` per day, maximum.
- The same place never twice in 30 days.
- Quiet hours apply.
- A dwell delay of about 60 seconds, so driving past does not fire.

> **You're near "Kiln"**
> _You saved it in June and never went._

Lands on `/item/{id}`.

### Permission sequencing

Do not ask for `Always` up front. Ask only from a user who has **opened the map
tab** and has **at least 5 geocoded places** — they have seen the feature's
raw material. Show an explanation screen before the system prompt, `WhenInUse`
first, then the upgrade. iOS will also surface its own "keep allowing?" prompt
after a while, and the honest way to survive it is to have sent something
worth keeping before it arrives.

Battery cost is modest — region monitoring uses cell and Wi-Fi rather than
continuous GPS — but it is not zero, and it should be measured on a real device
across a full day before release rather than asserted.

## Interrupting a scroll

The ask: when the user is doomscrolling TikTok or Instagram instead of opening
Shelvr, interrupt them with something from their own shelf.

This is the most differentiated idea in the set and the most constrained. It
splits cleanly into a version that ships now and a version that needs Apple's
permission.

### Tier 1 — no entitlement, ships with Phase 2

We cannot see other apps without Screen Time, but we do not have to in order to
get most of the value. **The user's own `item_opened` history tells us when
they are idle and receptive** — the weeknight window where they habitually
open things. That window is where doomscrolling lives, and targeting it needs
no permission, no native module and no store review.

Tier 1 is therefore not a separate kind at all: it is the `resurfacing` scorer
using personal rhythm instead of a global schedule. It is also the **only**
option on Android.

### Tier 2 — Screen Time, iOS only

Apple's `FamilyControls` / `DeviceActivity` / `ManagedSettings` stack does
exactly what was asked, and `react-native-device-activity` (0.6.1, updated
February 2026, peer `expo >= 52`) wraps it for Expo with `requestAuthorization`,
`DeviceActivitySelectionView`, `startMonitoring`, `onDeviceActivityMonitorEvent`,
and a `sendNotification` action available to the monitor extension.

Flow:

1. The user opts in explicitly. This is a feature they turn on, never a default.
2. `requestAuthorization` for `.individual`.
3. `DeviceActivitySelectionView` — Apple's own picker — lets them choose which
   apps count. **The tokens are opaque: Shelvr never learns which apps they
   picked.** That privacy property is Apple's, not ours, and it is also why
   this is defensible to ship.
4. `startMonitoring` with a `DeviceActivityEvent` whose `threshold` is the
   user's chosen limit (default 20 minutes within a rolling window).
5. On `eventDidReachThreshold`, the extension fires a **local** notification.

Four constraints that shape the build:

- **The entitlement is the long pole.** `com.apple.developer.family-controls`
  requires a request to Apple and approval for distribution. Start it in week
  one regardless of when the feature is scheduled; everything else can proceed
  in parallel.
- **A new native binary.** A config plugin, a `DeviceActivityMonitor` app
  extension and an App Group. Not OTA-able, and it changes the fingerprint —
  see `push-notifications.md`.
- **The extension has no network and no JS runtime.** It cannot pick an item
  when it fires. **The app must pre-stage a candidate** — title, image, deep
  link — into the shared App Group container every time it is foregrounded,
  and the extension reads whatever is there. Getting this wrong produces an
  empty or stale interruption, which is worse than none.
- **Android has no equivalent.** `UsageStatsManager` needs the special
  `PACKAGE_USAGE_STATS` grant and Play restricts it to apps whose core purpose
  is usage management, which Shelvr's is not. Android gets Tier 1.

The copy is the entire product here. The wrong version scolds:

> ~~You've been scrolling for 20 minutes.~~

The right version substitutes rather than reprimands — it offers the thing the
user themselves decided was worth their attention:

> **Something you saved**
> _"Miso-braised short ribs" — 4 minutes._

A reading-time estimate is worth adding for exactly this surface: the reason
people keep scrolling is that the alternative feels unbounded, and "4 minutes"
is what makes the alternative feel finite.

Cap: user-chosen 1–4 per day, default 2. Shelvr does **not** shield or block
the other app, even though `ManagedSettings` would allow it. Blocking makes
Shelvr an adversary of the user's own phone; offering makes it an alternative.
That distinction is the whole feature.

## Rollout

| Phase                                     | Ships                                                                                                                                                                            | Needs                                                   | Exit criteria                                                                        |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| **0. Instrument and govern**              | All 8 analytics events, `"notification"` in the `item_opened` source allowlist, outbox generalisation, budget ledger, arbiter, per-kind preferences (expand step), self-quieting | Backend deploy before client                            | Dashboard shows per-kind send → deliver → open → useful-return, for the weekly shelf |
| **1. Make the one we have worth opening** | Named-item copy, `richContent` image, category actions, `collapseId`, `quiet_week`                                                                                               | New binary for categories                               | Weekly shelf open rate ≥ 15%; mute rate < 5%                                         |
| **2. The contextual pair**                | `resurfacing` with personal-rhythm timing (Tier 1 intercept), `space_suggestions`                                                                                                | OTA                                                     | Notification-sourced useful returns ≥ 70% of organic                                 |
| **3. Business**                           | `trial_ending`                                                                                                                                                                   | OTA                                                     | Measurable trial-conversion lift                                                     |
| **4. Places**                             | Geocoding of `open_maps` intents, `itemPlaces`, geofencing, `nearby_place`                                                                                                       | New binary, `Always` location, Play declaration + video | ≥ 20% open rate; no measurable battery regression                                    |
| **5. Interception**                       | Screen Time Tier 2                                                                                                                                                               | **Apple entitlement**, new binary, App Group, extension | Opt-in retention beats control                                                       |

Two sequencing notes that matter more than the order itself:

- **Phase 0 ships no new notifications.** It is pure foundation, and doing it
  first is what makes every later phase evaluable instead of a guess.
- **Start the `FamilyControls` entitlement request during Phase 0.** Apple's
  approval, not the code, is the critical path for Phase 5.

Each phase respects the deploy order in `CLAUDE.md`: the Convex deploy lands
before the client update that needs it, public function shapes expand before
clients move, and nothing contracts until the production channel shows no old
bundle still calling it.

## Open questions

1. **Geocoding provider.** Google Geocoding reuses the existing
   `GOOGLE_MAPS_API_KEY` and adds the least new surface, but its terms restrict
   storing results. Confirm before Phase 4, or price an alternative.
2. **Does `resurfacing` need the model?** The scorer above is deterministic and
   uses only existing fields. A `gemini-3.1-flash-lite` pass could pick better,
   at a per-user-per-week cost. Ship deterministic, measure, then decide.
3. **Provisional authorization reach.** Expect lower delivery until users
   upgrade. Phase 0's events will size the gap; if it is severe, fall back to a
   conventional prompt after the first opened provisional notification.
4. **Non-Pro users.** Every save is gated on `requireProEntitlement`. Decide
   whether a lapsed user still gets `resurfacing` for saves they already own —
   arguably the best possible win-back, arguably a nag at someone who stopped
   paying.
5. **`intercept` cap interaction.** If a user sets 4 interceptions a day, is
   the weekly push budget still 2? Current answer is yes, on the grounds that
   they are different contracts, but it deserves a look once real data exists.
