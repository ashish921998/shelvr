# Growth funnel

Four questions the other dashboards do not answer: where installs come from,
whether new accounts start saving, whether they keep saving, and whether
shares bring anyone in. Payments and onboarding live in
[payment-funnel.md](payment-funnel.md); item reopen quality lives in
[README.md](README.md).

Everything below runs in PostHog SQL on existing events, except install
attribution, which only App Store Connect can see. Filter app and backend
events to `properties.environment = 'production'`. The website does not stamp
an environment, so web events are production by construction.

## 1. Where installs come from

The website's App Store links carry App Store Connect campaign tokens when
`NEXT_PUBLIC_APP_STORE_PROVIDER_TOKEN` is set in Vercel. Copy the `pt=` value
from App Store Connect → App Analytics → Campaigns (Generate a campaign link).
Without it, links stay plain and nothing is attributed.

- The campaign (`ct=`) is the visitor's own `?ct=` or `?utm_campaign=` from the
  landing URL, kept for the browser session. Give each creator, ad set or post
  its own link, for example `https://shelvr-web.vercel.app/?ct=tiktok_jane`.
- A visitor with no campaign gets `web_<button>` (`web_hero`, `web_header`,
  `web_footer`, `web_footer-nav`). The share preview page uses `share`.
- Campaigns are lowercased and reduced to `a-z 0-9 _ -`, at most 40 characters.

**Installs, first opens and paying users per campaign** are in App Store
Connect → App Analytics → Sources → Campaigns. Apple reports only campaigns
with enough users, and none of this reaches PostHog, so installs cannot be
joined to an account.

**Store clicks per campaign** (the top of that funnel) are in PostHog:

```sql
SELECT properties.campaign AS campaign, count() AS store_clicks
FROM events
WHERE event = 'app_store_clicked'
  AND timestamp > now() - INTERVAL 30 DAY
GROUP BY campaign
ORDER BY store_clicks DESC
```

Divide App Store Connect installs by these clicks per campaign for a
click-to-install rate. For a paid campaign, cost per paying user is its spend
over App Store Connect's paying users for that campaign.

## 2. Activation: a first real save

An account is **activated** once it makes a save of its own: an `item_saved`
whose `save_source` is not `onboarding_demo`. The onboarding demo save skips
the Pro gate and nearly every new account makes one, so it proves nothing. Both events are
server-side and keyed on the Convex user id.

Mature cohorts only: accounts created 37 to 7 days ago. `item_saved` has
carried `save_source` since 2026-09-20 (#128). Earlier saves have none, and the
filter drops them, so the cohort starts no earlier than that. The query returns
no rows until 2026-09-27.

```sql
WITH signups AS (
  SELECT distinct_id, min(timestamp) AS signed_up
  FROM events
  WHERE event = 'account_created'
    AND properties.environment = 'production'
    AND timestamp BETWEEN now() - INTERVAL 37 DAY AND now() - INTERVAL 7 DAY
    AND timestamp >= toDateTime('2026-09-20 00:00:00')
  GROUP BY distinct_id
),
first_saves AS (
  SELECT distinct_id, min(timestamp) AS first_save
  FROM events
  WHERE event = 'item_saved'
    AND properties.environment = 'production'
    AND properties.save_source != 'onboarding_demo'
  GROUP BY distinct_id
)
SELECT
  count() AS signups,
  countIf(first_save <= signed_up + INTERVAL 1 DAY) AS activated_day_1,
  countIf(first_save <= signed_up + INTERVAL 7 DAY) AS activated_week_1,
  round(activated_week_1 / signups, 3) AS activation_rate
FROM signups
LEFT JOIN first_saves USING distinct_id
```

Saving needs Pro, so activation is bounded by trial starts. Read it next to
`trial_started` for the same cohort: a low rate with high trial starts is a
product problem, a low rate with low trial starts is a paywall problem.

## 3. Retention: still saving

**Weekly active savers**, the number to watch week over week:

```sql
SELECT toStartOfWeek(timestamp) AS week,
  count(DISTINCT distinct_id) AS active_savers
FROM events
WHERE event = 'item_saved'
  AND properties.environment = 'production'
  AND properties.save_source != 'onboarding_demo'
  AND timestamp > now() - INTERVAL 12 WEEK
  AND timestamp >= toDateTime('2026-09-20 00:00:00')
GROUP BY week
ORDER BY week
```

Weeks before 2026-09-20 are left out rather than shown as zero, because their
saves carry no `save_source`.

**Save retention by first-save week**: of the accounts activated in a week, the
share that saved again in each later week. Build it as a PostHog Retention
insight: cohortizing event `item_saved`, returning event `item_saved`, both
filtered to `save_source != onboarding_demo` and `environment = production`,
weekly, "first time" retention. Opens (`Application Opened`) retain better
than saves and flatter the product; saves are the behavior Pro pays for.

## 4. Shares: does sharing bring anyone in

A branded share link (`/i/<token>`) never reaches analytics as its token,
because the token opens the item's preview. The app and the website report
`share_ref` instead: the first 16 hex characters of the token's SHA-256.

| Event               | Where                          | `share_ref`                               |
| ------------------- | ------------------------------ | ----------------------------------------- |
| `item_shared`       | App, item detail or feed share | Set when a branded link went out          |
| `share_page_viewed` | Website, share preview page    | Always; see `outcome` below               |
| `app_store_clicked` | Website, share page's Download | Set; `source = share`, `campaign = share` |

`item_shared` also carries `surface` (`item_detail` or `feed`). Before this
release the feed did not send `item_shared` at all, so counts step up at that
release. Sharing an image or a source URL sends no `share_ref`.

`share_page_viewed` carries `outcome`:

- `found`: the preview rendered.
- `missing`: a dead link, meaning an unknown or revoked token.
- `unavailable`: the backend could not be reached. Count it as an outage, not a dead link.

`item_shared` comes from the app, so filter it to production. Development and
preview builds stamp another environment. Web events carry none, so the
production filter applies to app rows only.

**Share loop totals, last 30 days**:

```sql
SELECT
  countIf(event = 'item_shared' AND properties.share_ref IS NOT NULL) AS branded_shares,
  countIf(event = 'share_page_viewed') AS page_views,
  count(DISTINCT if(event = 'share_page_viewed', distinct_id, NULL)) AS viewers,
  countIf(event = 'app_store_clicked' AND properties.source = 'share') AS store_clicks
FROM events
WHERE event IN ('item_shared', 'share_page_viewed', 'app_store_clicked')
  AND timestamp > now() - INTERVAL 30 DAY
  AND (event != 'item_shared' OR properties.environment = 'production')
```

**Who drives views**: page views and store clicks credited to each sharer.

```sql
WITH shares AS (
  SELECT properties.share_ref AS ref, any(person_id) AS sharer
  FROM events
  WHERE event = 'item_shared' AND properties.share_ref IS NOT NULL
    AND properties.environment = 'production'
  GROUP BY ref
)
SELECT shares.sharer,
  countIf(e.event = 'share_page_viewed') AS page_views,
  countIf(e.event = 'app_store_clicked') AS store_clicks
FROM events AS e
INNER JOIN shares ON e.properties.share_ref = shares.ref
WHERE e.event IN ('share_page_viewed', 'app_store_clicked')
  AND e.timestamp > now() - INTERVAL 30 DAY
GROUP BY shares.sharer
ORDER BY page_views DESC
```

Installs from shares are App Store Connect's `share` campaign (section 1).
Link previews fetched by chat apps do not run the page's script, so they are
not counted as views.

## Not measured yet

- A viewer's install cannot be joined to their new account. Apple does not
  pass campaign data into the app, and the website and app keep separate
  identities.
- The app does not ask how people heard about Shelvr. Add a single optional
  onboarding question if App Store Connect's campaign view is not enough.
