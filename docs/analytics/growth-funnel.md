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
  `web_footer`, `web_footer-nav`, `web_oracle`, `web_place_tool` for the reel
  place finder's results card, `web_place_banner` for the finder's phone
  banner, `web_bio` for the bio page and `web_plan` for the plan vote page).
  The share preview page uses `share`.
- Campaigns are lowercased and reduced to `a-z 0-9 _ -`, at most 40 characters.

**Installs, first opens and paying users per campaign** are in App Store
Connect → App Analytics → Sources → Campaigns. Apple reports only campaigns
with enough users, and none of this reaches PostHog, so installs cannot be
joined to an account.

**Visitors per campaign** come from the website's `$pageview`, which carries
the arrival `campaign`, the path without its query, and `$referring_domain`
(the linking site's host only). Page views start with the release that added
them; earlier visits left no trace.

```sql
SELECT properties.campaign AS campaign,
  count(DISTINCT distinct_id) AS visitors,
  count() AS page_views
FROM events
WHERE event = '$pageview'
  AND timestamp > now() - INTERVAL 30 DAY
GROUP BY campaign
ORDER BY visitors DESC
```

Swap `properties.campaign` for `properties.$referring_domain` to see visits a
link brought without its `?ct=` tag.

**Store clicks per campaign** (the next step of that funnel) are in PostHog:

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

## 5. The oracle: does a free verdict earn an install

`/oracle` gives a no-login visitor a verdict about their saving habits, then
an App Store link. Its link uses `source = oracle`, so a visitor who arrived
without a campaign lands in App Store Connect's `web_oracle` campaign. A
visitor who arrived with a creator's `?ct=` keeps that campaign instead.

| Event                 | When                           | Properties                                                                       |
| --------------------- | ------------------------------ | -------------------------------------------------------------------------------- |
| `oracle_opened`       | The page loads                 | `mode` when the URL carries `?mode=`                                             |
| `oracle_started`      | The visitor submits an input   | `mode`                                                                           |
| `oracle_verdict`      | A verdict renders              | `mode`                                                                           |
| `oracle_failed`       | The request fails              | `mode`, `status` (HTTP status, `0` for a network error; `429` is the rate limit) |
| `oracle_shared`       | The visitor shares a verdict   | `mode`, `method` (`web_share_image`, `web_share`, `clipboard` or `save_image`)   |
| `oracle_share_viewed` | Someone opens a shared verdict | `mode`                                                                           |

`mode` is `links`, `screenshot`, `tabs`, or `library`. A shared verdict links
to its own page, `/oracle/s?c=…`, which carries the persona, tagline and
spaces in the URL (never the per-item guesses) and renders them as the link
preview image from `/oracle/og`. Nothing is stored. The page's "Ask the
oracle" button opens `/oracle?mode=<mode>`, so `oracle_opened` with a `mode`
is mostly share traffic. Opening a shared verdict also makes `oracle_share`
the campaign for the rest of that browser session, unless the visitor arrived
with a campaign of their own, so store clicks after a share credit it.

**Oracle funnel by mode, last 30 days**:

```sql
SELECT
  properties.mode AS mode,
  countIf(event = 'oracle_started') AS started,
  countIf(event = 'oracle_verdict') AS verdicts,
  countIf(event = 'oracle_failed') AS failed,
  countIf(event = 'oracle_shared') AS shared,
  countIf(event = 'oracle_share_viewed') AS share_views
FROM events
WHERE event IN ('oracle_started', 'oracle_verdict', 'oracle_failed', 'oracle_shared', 'oracle_share_viewed')
  AND timestamp > now() - INTERVAL 30 DAY
GROUP BY mode
ORDER BY started DESC
```

Store clicks from the page are `app_store_clicked` with `source = 'oracle'`.

## 6. The landing page and the finder: who clicks through

The landing page's buttons (`source` `header`, `hero` and `footer`) and the
reel place finder's results card (`source = place_tool`) are read per browser:
`distinct_id`, the site's `shelvr_web_distinct_id`. Clicks per page view would
mislead. One view can send several clicks (the header, hero and footer
buttons, or a second click after a return from the App Store), and the views
of one browser are not independent trials.

`$pageview` carries `$pathname`, but a click carries only `$current_url`, so
the root is matched with a regex. Match the URL as well as the source: `/apple`
also sends `header` and `hero`.

**Landing click-through per browser**: of the browsers with a `$pageview` on
`/`, the share that clicked a store button there. Replace the two bounds with
the window's start and end.

```sql
SELECT count() AS browsers,
  countIf(clicked) AS clicked_browsers,
  round(clicked_browsers / browsers, 4) AS click_through
FROM (
  SELECT distinct_id,
    countIf(event = '$pageview') > 0 AS landed,
    countIf(event = 'app_store_clicked') > 0 AS clicked
  FROM events
  WHERE timestamp >= toDateTime('<window start>')
    AND timestamp < toDateTime('<window end>')
    AND (
      (event = '$pageview' AND properties.$pathname = '/')
      OR (event = 'app_store_clicked'
        AND properties.source IN ('header', 'hero', 'footer')
        AND match(properties.$current_url, '^https?://[^/]+/$'))
    )
  GROUP BY distinct_id
)
WHERE landed
```

**Finder click-through per browser**: of the browsers that saw a result with
places (`place_tool_result` with `count > 0`) or the sample
(`place_tool_sample_opened`), the share that clicked the results card. Same
bounds.

```sql
SELECT count() AS browsers,
  countIf(clicked) AS clicked_browsers,
  round(clicked_browsers / browsers, 4) AS click_through
FROM (
  SELECT distinct_id,
    countIf(event != 'app_store_clicked') > 0 AS shown,
    countIf(event = 'app_store_clicked') > 0 AS clicked
  FROM events
  WHERE timestamp >= toDateTime('<window start>')
    AND timestamp < toDateTime('<window end>')
    AND (
      (event = 'place_tool_result' AND toFloat(properties.count) > 0)
      OR event = 'place_tool_sample_opened'
      OR (event = 'app_store_clicked' AND properties.source = 'place_tool')
    )
  GROUP BY distinct_id
)
WHERE shown
```

To read a change to either page, compare whole weeks before and after its
deploy (four on each side), and report the difference as a direction, not an
effect: the season and the campaigns move too.

### The button emoji test

The four buttons in `MapCta` (`header`, `hero`, `footer` and `place_tool`)
test their label 50/50: `plain` ("Map my saves", "Save these to Shelvr") or
`emoji` (the same label, then a no-break space and 📍). The badges on the share
pages, `/apple` and the bio page are not in the test.

- **Assignment.** The inline script from `apps/web/src/lib/ctaVariant.ts` runs
  in the root layout's `<head>`. On a page load with no valid stored value it
  draws a variant and stores it in `localStorage` as `shelvr_cta_variant`, and
  on every load it sets `data-cta` on `<html>` before the first paint. The page
  shows the 📍 only under `data-cta="emoji"`.
- **Events.** Every web event from that browser carries `cta_variant`:
  `$pageview`, `app_store_clicked` and the finder's events among them. A
  browser whose storage is blocked or throws has no variant: it sees the plain
  label, sends no `cta_variant`, and falls out of the comparison.
- **Safari.** Tracking prevention deletes a site's script-writable storage
  after 7 days of Safari use without interaction with the site. That clears
  `shelvr_cta_variant` and `shelvr_web_distinct_id` together, so a visitor who
  comes back later counts as a new browser with a fresh draw. Counting browsers
  handles that; nothing promises one person the same label for ever.
- **Before and after reads.** For a window after the test went live, add
  `AND coalesce(properties.cta_variant, 'plain') = 'plain'` to the inner
  `WHERE` of the two queries above, so the emoji arm stays out of them.

**Landing click-through per variant**: each browser's variant is the one on its
first `$pageview` of `/`. No date bounds are needed: only events after the
test's deploy carry a variant.

```sql
SELECT variant,
  count() AS browsers,
  countIf(clicked) AS clicked_browsers,
  round(clicked_browsers / browsers, 4) AS click_through
FROM (
  SELECT distinct_id,
    argMinIf(properties.cta_variant, timestamp, event = '$pageview') AS variant,
    countIf(event = 'app_store_clicked') > 0 AS clicked
  FROM events
  WHERE properties.cta_variant IN ('plain', 'emoji')
    AND (
      (event = '$pageview' AND properties.$pathname = '/')
      OR (event = 'app_store_clicked'
        AND properties.source IN ('header', 'hero', 'footer')
        AND match(properties.$current_url, '^https?://[^/]+/$'))
    )
  GROUP BY distinct_id
)
WHERE variant IN ('plain', 'emoji')
GROUP BY variant
```

**Finder click-through per variant**: the same events as the finder query.
Each browser's variant is the one on the first result with places, or the
sample, that it saw.

```sql
SELECT variant,
  count() AS browsers,
  countIf(clicked) AS clicked_browsers,
  round(clicked_browsers / browsers, 4) AS click_through
FROM (
  SELECT distinct_id,
    argMinIf(properties.cta_variant, timestamp, event != 'app_store_clicked') AS variant,
    countIf(event = 'app_store_clicked') > 0 AS clicked
  FROM events
  WHERE properties.cta_variant IN ('plain', 'emoji')
    AND (
      (event = 'place_tool_result' AND toFloat(properties.count) > 0)
      OR event = 'place_tool_sample_opened'
      OR (event = 'app_store_clicked' AND properties.source = 'place_tool')
    )
  GROUP BY distinct_id
)
WHERE variant IN ('plain', 'emoji')
GROUP BY variant
```

**Significance**: the pooled two-proportion z-test on browsers,
z = (pₑ − pₚ) / √(p̂ (1 − p̂) (1/nₑ + 1/nₚ)), where pₑ and pₚ are the two
click-through rates, nₑ and nₚ the browsers, and
p̂ = (clickedₑ + clickedₚ) / (nₑ + nₚ).

The read rule was fixed before launch:

- **What decides.** The landing click-through per browser. Report the finder's
  too, but it does not decide, because its traffic is smaller.
- **Size.** The test is sized for a 20% relative lift in landing click-through.
  Per arm, n = 7.84 × (p(1 − p) + q(1 − q)) / (q − p)², where p is the landing
  click-through per browser over the 4 weeks before the test went live (the
  landing query above) and q = 1.2 p. That gives 80% power at a two-sided α of
  0.05. For example, p = 10% needs about 3,800 browsers per arm, and p = 5%
  about 8,100.
- **Duration.** Whole weeks, until both arms reach n, but at least 2 weeks and
  at most 8. Read the result once, at the end, not while it runs.
- **Decision.** Keep the emoji only if z > 1.96 (its landing click-through is
  higher at p < 0.05). Otherwise keep the plain label.
- **Short of n.** If 8 weeks do not reach n, stop and apply the same rule. Then
  report the smallest relative lift the run could detect, about
  2.8 × √(2(1 − p) / (n p)) for the n reached, and say that the test only rules
  out large effects.
- **Afterwards.** Remove the test: keep the winning label, and delete
  `ctaVariant.ts` with the head script, the `.cta-emoji` rules with the
  button's layout effect, the `cta_variant` property, the privacy policy's
  sentences about it, and this subsection.

## Not measured yet

- A viewer's install cannot be joined to their new account. Apple does not
  pass campaign data into the app, and the website and app keep separate
  identities.
- The app does not ask how people heard about Shelvr. Add a single optional
  onboarding question if App Store Connect's campaign view is not enough.
