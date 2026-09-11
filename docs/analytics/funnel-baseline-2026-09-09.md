# Shelvr funnel baseline — 9 September 2026

Status: **acquisition baseline captured; product conversion remains provisional**.
Apple authentication was restored and the CLI 5.1.0 web analytics commands succeeded
on September 9 at approximately 10:48 UTC. The database snapshot and available
PostHog events are verified. Missing instrumentation values are not zeros.

## Scope

- App Store app: `6798143550`, live version `1.0.1`.
- PostHog: [Shelvr, project 546847](https://us.posthog.com/project/546847), UTC.
- Fixed event window: **1–8 September 2026 inclusive, UTC**. This is an eight-day
  initial snapshot, not a seven-day weekly comparison.
- Apple acquisition comparison window: **September 1–7, UTC**, queried at daily
  frequency. September 8 has one download but zero reported impressions/page views;
  it is excluded from the aligned acquisition baseline because reporting appears
  incomplete. Do not divide September 1–8 downloads by September 1–7 exposures.
- Database snapshot: **9 September 2026, approximately 09:21 UTC**, production
  deployment `amiable-setter-120`. This includes retained records as of collection,
  not only activity in the event window.
- Database counts exclude the confirmed owner account and recognized example/test
  email domains. Explicit item fixtures are excluded. The other accounts have
  not all been independently verified as external customers. Historical development
  builds previously used this production backend; these counts may retain test traffic.
- PostHog uses `environment=production` and the project's Internal / Test users
  exclusion (cohort `461977`). That filter cannot prove all remaining traffic is external.

## Verified starting numbers

### App Store acquisition

| Metric, September 1–7 | Value | Definition / interpretation |
| --- | ---: | --- |
| Impressions | 72 | Total views, not distinct devices |
| Product page views | 41 | Total views, not distinct devices |
| First-time downloads | 5 | Apple `units` |
| Redownloads | 0 | Apple `redownloads` |
| Apple-reported conversion rate | 9.62% | Preserve returned `conversionRate.total`; do not calculate as 5/72 |

Apple defines conversion using downloads/pre-orders divided by unique-device
impressions. The default overview exposes total impressions, so those 72 views are
not its denominator. The separate unique impression count was not fetched.
`pageViewUnique.total` is returned as an AVERAGE (5), not a period-distinct total;
the daily values sum to 32 device-days. Neither should be called 32 distinct people.

The September 1–8 snapshot has six first-time downloads, no redownloads, 72 total
impressions, 41 total page views, and a reported conversion rate of 11.54%.
Preserve that snapshot but use the aligned September 1–7 numbers for the baseline.
Apple also reports zero proceeds, zero paying users, two IAP transactions, two
active subscription plans, and zero paid subscription state across the September
1–8 query. The two IAP transactions must not be described as two paid customers;
the backend snapshot independently shows two trials.

### Acquisition sources

The CLI `sources` command returns **daily unique product page views by source**.
Summing those daily values over September 1–7 gives the following device-day
activity, not unique people over the whole period:

| Source | Sum of daily unique page-view counts |
| --- | ---: |
| Web Referrer | 18 |
| App Referrer | 11 |
| App Store Browse | 5 |
| App Store Search | 3 |
| Institutional Purchase | 0 |
| Unavailable | 0 |

Devices can appear in more than one source/day. These rows sum to 37, versus 32
device-days in the unsegmented query, so they must not be combined as a disjoint
user funnel. They do not tell us which source generated the five downloads.
Country-level acquisition and source-level download conversion were not retrieved:
the installed CLI's metrics command has no grouping flag and its sources command
is fixed to page views. These remain deeper-analysis gaps, not authentication blockers.

Apple's benchmark response covers August 10–16 and contains no peer percentile
values. It is not a valid comparison for this September baseline.

### Product and subscription snapshot

| Metric | Value | Interpretation |
| --- | ---: | --- |
| Accounts currently in production | 13 | Includes one confirmed owner/test account |
| Accounts remaining after known exclusions | 12 | Customer classification incomplete |
| Remaining accounts with a retained save | 2 | Both have at least one ready item |
| Retained items owned by those accounts | 8 | 7 ready, 1 failed |
| Remaining accounts created September 1–8 | 5 | Database creation timestamps; excludes deleted accounts |
| Those five with a retained save at collection | 1 | Descriptive 1/5; **not** a mature activation rate |
| Retained items created September 1–8, known owner excluded | 4 | Current database records, not an event-complete historical count |
| Production-tagged saves recorded in PostHog September 1–8 | 1 | September 8; one saving identity after configured test filtering |
| Active trial subscription records at collection | 2 | Current state, not trial starts during the event window |
| Active promotional Pro records | 1 | Promotional entitlement, not a paid subscription |
| Active non-promotional paid subscription records | 0 | Based on current subscription records; not lifetime revenue |

The production subscription table contains two annual `trialing` records and one
`rc_promo_Shelvr Pro_monthly` promotional `pro` record. All three had future expiry
timestamps at collection. Do not count the promotional entitlement as a payment.

The 1/5 account-to-retained-save snapshot is 20%; 2/12 across all remaining accounts
is 16.7%. Neither is the requested onboarding-to-first-save conversion: deleted
saves are absent, onboarding timestamps are unavailable, recent accounts may not
have seven days of follow-up, and historical test traffic is incompletely classified.

## Funnel coverage

| Stage | Baseline | Evidence / limitation |
| --- | --- | --- |
| App Store unique impressions | Not fetched directly | 72 total impressions and Apple-reported 9.62% conversion for September 1–7; total views are not the conversion denominator |
| Product page views | 41 | September 1–7 total page views |
| First-time downloads and redownloads | 5 / 0 | September 1–7; one additional first-time download on September 8 |
| First app open | Not measurable for production | `Application Opened` taxonomy has development traffic only |
| New account | 5 retained accounts created September 1–8 | Database proxy; server `account_created` collection began September 8 and has no production arrivals in the checked window |
| Onboarding completion | Not measurable | Completion and step events are absent from captured taxonomy; instrumented native release remains pending |
| First save within seven days of onboarding | Not measurable | One production save event exists, but no measured onboarding cohort |
| Paywall presentation attempt | Not measurable | No captured production attempt events; never substitute `paywall_shown` as abandonment denominator |
| Trial starts | Not measurable historically | Two active trial records are a stock count; they are not two observed trial-start events |
| First positive payment | No production events observed | Collection is recent; development payment events exist. No mature payment-conversion denominator |
| Source / country conversion | Incomplete | Source page-view activity captured above; source download conversion and country breakdown not retrieved; identities remain unstitched |

## Baseline assets and collection setup

- [Daily acquisition CSV](funnel-baseline-2026-09-09-daily.csv), checked against the
  Apple response totals (5 downloads, 72 impressions, 41 page views).
- Raw CLI responses are not committed. The App Store Connect CLI writes them to
  `.asc/reports/` locally (gitignored); regenerate them with the commands below.
- A diagnostic weekly-frequency query showed that weekly frequency expands
  to calendar-week buckets (including August 31 and the week of September 7). Its
  six downloads and 73 impressions do not match the exact requested daily window;
  it is deliberately excluded from this baseline. Use daily frequency for exact dates.

Reproduce the aligned acquisition snapshot:

```sh
asc web analytics metrics --app 6798143550 --start 2026-09-01 --end 2026-09-07 --measures units,redownloads,conversionRate,impressionsTotal,pageViewCount,pageViewUnique --frequency day
asc web analytics sources --app 6798143550 --start 2026-09-01 --end 2026-09-07
```

- [Existing onboarding and payment dashboard](https://us.posthog.com/project/546847/dashboard/2075680)
- [Fixed September 1–8 save baseline](https://us.posthog.com/project/546847/insights/IwPLSXqz)
  added to that dashboard and executed after saving. Verified output: one save
  and one daily saving identity on September 8. Earlier empty days reflect limited
  collection coverage, not proof of no saves. Daily unique counts must not be summed
  to obtain unique users over multiple days.
- Created Apple `ONGOING` request `2691d976-2057-43c5-8081-a1129426317b` for continued
  report availability, using `--reuse-existing`.
- Created Apple `ONE_TIME_SNAPSHOT` request `3586446c-e4bf-4bed-a677-5b19183caf42`
  to request available historical data, also using `--reuse-existing`.
- Ongoing report IDs: downloads `r3-2691d976-2057-43c5-8081-a1129426317b`;
  discovery/engagement `r14-2691d976-2057-43c5-8081-a1129426317b`.
  Both returned zero generated instances during this audit. A report definition
  existing does not mean downloadable data exists.

The existing dashboard refresh returned no production onboarding/payment funnel
entrants. One funnel formatter still reported its default 30-day range despite
the requested override, so no fixed-window conversion values were taken from it.
The saved baseline was independently run with explicit dates and its returned
dates checked. No customer events were backfilled or fabricated.

## Definitions for the first complete baseline

1. **Store acquisition:** retain Apple's own unique-impression conversion metric,
   first-time downloads, redownloads, and page views. Use the same window, source,
   territory, and platform. Do not sum overlapping device-unique breakdowns or call
   a downloads/page-views ratio a sequential user funnel without attribution.
2. **Activation:** measured onboarding completion followed by the person's first
   successful save within seven days. Use `item_saved` as the canonical backend save
   event rather than adding it to client save events and double counting. Separately
   track whether the item becomes ready. Only publish final rates for entrants with
   the full seven-day observation window.
3. **Monetization:** branch at the paywall. Monthly can produce an immediate charge;
   annual can start a trial. Use server `payment_succeeded`, excluding ordinary
   renewals for first-payment conversion. Free trials, restores, and promotional
   entitlements are not payments. Use the existing fourteen-day conversion window
   and label recent entrants as immature.
4. **No forced save-before-payment order:** Shelvr requires Pro for new saves. A
   monthly customer can pay before saving; an annual trial user can save before
   the first charge. Acquisition, activation, and monetization need linked analyses,
   not one incorrectly ordered linear funnel.
5. **Weekly comparison:** once coverage is established, compare complete Monday–Sunday
   UTC periods, ending at the latest date available in both systems. Record coverage
   start dates and exclude known internal/sandbox traffic. Apple acquisition remains
   aggregate; do not imply person-level attribution to PostHog without an actual bridge.

See [payment instrumentation and rollout](payment-funnel.md),
[billing isolation](../billing-isolation-2026-09-08.md),
[Apple acquisition definitions](https://developer.apple.com/help/app-store-connect-analytics/acquisition/acquisition),
and [PostHog funnel ordering](https://posthog.com/docs/product-analytics/funnels#how-to-create-a-funnel).

## Interpretation and remaining work

- Discovery volume is small: five downloads in the aligned period is insufficient
  to establish a reliable listing experiment or diagnose the icon/screenshots.
  Recruit qualified users while improving measurement; avoid reacting to the
  unsupported universal 25% conversion target.
- Retrieve source-level downloads and country breakdowns when available. Re-query
  September 8 after reporting catches up rather than accepting its exposure zeros.
- Release the already-implemented native analytics and verify real production
  first-open, onboarding, and paywall event arrival. This audit did not ship a binary.
- Confirm external-user classification and wait for complete activation/payment
  windows before interpreting customer conversion rates.

No scheduled task was created. Apple's ongoing report request enables report
availability; it does not itself deliver a weekly analysis or notification.
