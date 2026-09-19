# In-app feedback delivery

The Home invitation and the Profile entry open the same `FeedbackModal`
(`apps/native/src/components/feedback/feedback-modal.tsx`). Sending is
persist-first: the client calls the public `submitFeedback` mutation in
`convex/feedback.ts`, which writes a `feedbackSubmissions` row and returns
`deliveryState` (`scheduled` when the inbox is configured, `unconfigured` when
it is not — the row's internal status is `pending` either way at that point).
Only then does the client treat the send as accepted — the modal says
"thanks" because Convex persisted the submission, never because an email went
out. The projection to the support inbox is server-side work the client cannot
observe.

## Projection to the support inbox

Each new submission is scheduled into the internal `deliver` action, one
claim → send → finish cycle following the waitlist pattern
(`convex/waitlist.ts`):

- `claimDelivery` loads the row and its safe reply context. There is no
  in-flight lease: a row already `delivered`, at the attempt cap, or awaiting
  operator configuration (`unconfigured`, spending no attempt) returns
  nothing to send. The rare retry racing a still-queued immediate action can
  at worst duplicate one email to the operator — never lose a row.
- The action sends the email through Resend and calls `finishDelivery` with
  the result. Persisted state only advances through `finishDelivery`, so a
  crashed attempt leaves the row exactly as it was for the retry worker.
- The hourly cron `retry feedback inbox delivery` (`convex/crons.ts`) scans
  `pending`, `failed`, and `unconfigured` rows via the `by_status_attempts`
  index and retries them below `MAX_DELIVERY_ATTEMPTS` (10). A Resend outage
  or missing operator configuration can never lose feedback; the row simply
  waits.
- The email's `reply_to` is the sender's account email, so the operator
  replies directly from the inbox. The subject line carries only the surface
  and bounded app context; the message body is the feedback itself.

Operator configuration lives in the Convex deployment environment
(declared in `convex/convex.config.ts`):

- `RESEND_FEEDBACK_INBOX_EMAIL` — where feedback lands.
- `RESEND_FEEDBACK_FROM_EMAIL` — the verified sending address.

With either missing (or no `RESEND_API_KEY`), submissions are stored with
status `unconfigured` and no attempt is spent; the retry worker delivers them
once configuration appears.

## Privacy boundary

The typed message is user content and stops at Convex and the support inbox:

- PostHog never receives it. The old PostHog transport is gone; the client
  captures `feedback_submitted` after Convex accepts, with `surface`,
  `char_count`, and the content-free `delivery` category only
  (`src/lib/feedback.ts`). Session replays mask all text inputs globally
  (see `src/lib/posthog.ts`).
- Backend `logEvent` lines carry category/status codes, attempt counts, and
  ids — never message bodies, emails, or URLs.
- Client errors go through `analytics.captureError("feedback_submit_failed", …)`
  with a sanitized message.

## Retention boundary

Deleting a `feedbackSubmissions` row removes the Convex copy only. It cannot
retract an email already delivered to the support inbox — treat the inbox as
the retention surface for anything that has landed there. Account deletion
(`convex/users.ts`) drains feedback rows in batches with the rest of the
account's data, for exactly this reason: the user-authored message does not
outlive the account in Convex.

## Submission limits

`submitFeedback` is authenticated (`requireUserId`) and rate-limited per
account by the `feedbackSubmit` token bucket (6 per day, burst 3). Feedback is
a support channel, not a Pro feature, so there is no entitlement gate. The
server re-validates the message (non-empty, capped length) and every bounded
context field: `platform` is a closed union, and the version strings are
capped at write time. The client sends only values it can source from the
build; it never guesses context.

## Client contract

- `available` is `user !== null` — analytics availability no longer gates
  anything. Without an account the modal offers the support mailto instead
  of a Send that does nothing.
- A failed send keeps the draft on screen, editable and re-sendable, with the
  support channel offered. The invitation is not marked submitted, so nothing
  pretends the feedback landed.
- The reply notice (`feedback.replyNotice` in every catalog) tells the user
  that replies use their account email, so offering that email to the operator
  is not a surprise.
