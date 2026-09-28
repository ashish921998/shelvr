# Apple refund consent

Refund entitlement reconciliation and sharing information for Apple's refund
review are separate mechanisms. Reconciliation continues for everyone. Sharing
requires a recorded choice in `legalConsents` and a matching RevenueCat policy.

## User flow

On iOS, Profile offers the review of terms version `2026-09-19`. It
highlights the optional Apple disclosure and links to Terms and Privacy.
“Agree and allow sharing” records acceptance; “Not now” records that the version
was reviewed without authorizing sharing. No acceptance is inferred from
existing accounts, purchases, or opening Customer Center. Android does not show
the Apple consent flow.

The review is not a blocking screen. It first shipped as a gate after
onboarding, which showed brand-new users an "Updated terms" wall right after
the paywall. Declining it changed nothing, because without an opt-in RevenueCat
already does not respond to refund requests, so the gate was removed.

Profile also provides withdrawal. Withdrawing keeps the terms
acceptance receipt but changes the sharing preference. A pending status makes
clear that RevenueCat can still use the previous setting until sync completes.

## Source of truth and delivery

`legalConsent.review` derives the user from authentication and records the
server timestamp, reviewed/accepted version, and desired preference.
Only the exact displayed version is accepted. Never backfill acceptance for
existing users. Future versions must preserve the public API contract for older
installed clients; add a compatible version or a new endpoint rather than
replacing the existing literal validator.

`legalConsentSync` sends only these attributes to RevenueCat:

- `apple_refund_consent`: the string `true` or `false`.
- `apple_refund_consent_version`: the accepted version when sharing is allowed,
  otherwise an empty string (removes the attribute).

No saved content or product analytics is sent. RevenueCat's built-in Apple
response uses purchase/delivery information and the sample-content flag.

The monotonic `changedAt` timestamp identifies each decision for stale-worker
checks and supplies RevenueCat’s `updated_at_ms` value. RevenueCat ignores
older attribute updates. One claimed worker per record also serializes delivery;
a changed decision schedules another pass after the current worker finishes.
Failures retry with backoff up to twenty attempts — roughly ten hours —
then stop as `failed` for manual inspection (logging
`refund_consent_sync_exhausted`); a later consent change revives the record
with a fresh budget. Withdrawals never cap — any sync that revokes remote
sharing (sharing off, obsolete terms acceptance, or deletion) retries until
RevenueCat accepts it. A bounded minute cron recovers lost jobs
and claims older than the maximum action runtime. Missing credentials cannot
mark a grant synced. The worker creates a missing RevenueCat customer when a
live user's choice precedes SDK registration.

Account deletion records withdrawal before deleting the account. Its minimal
consent record remains until remote revocation succeeds, then is removed. A
missing RevenueCat customer counts as revoked during deletion and is not
recreated by the cleanup worker. Previously shared data cannot be recalled.

## RevenueCat policy

All conditions must match in one policy group:

1. Platform is iOS.
2. `apple_refund_consent` is `true`.
3. `apple_refund_consent_version` is `2026-09-19`.

Response: **Send consumption data only**. Default policy: **Do not respond to
refund requests**. Never use a first-purchase cutoff as a substitute for consent.
The default also excludes old app versions, missing attributes, and Android.
Keep the version condition aligned with reviewed disclosures, and inspect any
legacy `$appleRefundHandlingPreference` overrides before relying on policies.

Deploy the backend before releasing the client. Publish Terms and Privacy before
users receive the new terms-review UI. A saved policy can remain dormant with
zero eligible customers until the client is released. Validate opting in,
withdrawing, retrying failures, and deleting an account against the development
RevenueCat project. A real Apple sandbox refund remains a distinct store test.

References: [RevenueCat policy configuration](https://www.revenuecat.com/docs/customers/refund-control/configure-refund-policies),
[attribute conflict handling](https://www.revenuecat.com/docs/api-v1/customers#update-customer-attributes).
