# Automatic imports from X, TikTok and Instagram

Status: X built behind credentials (not deployed, not configured). TikTok and
Instagram: no allowed automatic route for most users. Researched 2026-10-02.

## The problem

Importing X bookmarks meant: request a data archive in X settings, wait up to
a day for the email, download and unzip it, find `data/bookmark.js`, copy the
JSON, paste it into Shelvr. Most people stop at step one, and the archive only
captures bookmarks up to the day it was made, so new ones never arrive.

The goal is "connect once, then it just happens". Only official APIs count:
no scraping, no logging in as the user, no browser extensions.

## Summary

| Platform  | Automatic?                                 | How                                                        | Cost to Shelvr                    | App Review risk |
| --------- | ------------------------------------------ | ---------------------------------------------------------- | --------------------------------- | --------------- |
| X         | Yes, for everyone                          | OAuth 2.0 "Connect X", then a twice-daily bookmark sync    | Pay per bookmark read (see below) | Low             |
| TikTok    | EEA and UK users only, after TikTok review | Data Portability API, "Favourite Videos" in activity data  | Free API, heavy review and build  | Low to medium   |
| Instagram | Not for third-party apps in general        | Saves are not in any public API; EU-only DMA route unclear | n/a                               | High if faked   |

For TikTok and Instagram the share sheet stays the fast path: two taps per
post, and Shelvr already reads TikTok and Instagram links.

## X

**Possible: yes.** `GET /2/users/:id/bookmarks` returns the signed-in user's
bookmarks, newest first, for an OAuth 2.0 user token with
`tweet.read users.read bookmark.read offline.access`. `offline.access` gives a
refresh token, so the sync keeps working without the user. X only returns about
the most recent 800 bookmarks, so a very old backlog still needs the archive
import.

**Cost.** Since 2026-02-06 the X API is pay-per-use by default, with no
subscription or minimum. Since 2026-04-20 reading your own data ("owned
reads", which bookmarks are) costs $0.001 per bookmark returned. Shelvr pays,
not the user. Estimates per connected user:

- First sync: up to 800 bookmarks, at most $0.80, once.
- Ongoing: one page of 10 twice a day when nothing is new, about $0.02 a day,
  roughly $0.60 a month. New bookmarks add $0.001 each.
- `GET /2/users/me` once per connect.

Against $4.99 a month that is real but small. The two knobs are
`X_SYNC_INTERVAL_MS` and `INCREMENTAL_PAGE_SIZE` in `convex/xImport.ts`. Syncs
skip users without Pro, so a lapsed subscriber costs nothing.

These numbers come from X's pricing announcements as reported in search
results; the X docs site was not reachable from the build environment, so
confirm on the X developer console before turning it on.

**How it works in this PR.**

1. The import screen shows "Connect X" when the backend has X credentials.
2. `startXConnect` creates a one-time `state` and PKCE verifier and returns
   X's consent URL. The app opens it in an auth session.
3. X redirects to `/x/oauth/callback` on the Convex site. The HTTP action
   exchanges the code (confidential client, Basic auth), reads the X user id,
   stores tokens in `xConnections`, and schedules the first sync. The browser
   goes back to `shelvr://import?x=connected`.
4. `syncBookmarks` refreshes the token when needed (X rotates refresh tokens),
   pages bookmarks, and saves each new post through the same pipeline as a
   pasted link (`partitionImportUrls` and `insertImportedLinks` in `items.ts`),
   drawing from the existing `bulkImport` rate limit.
5. `xImportedPosts` remembers every post handled, so a deleted save never
   comes back. The first sync reads every page; later syncs stop at the first
   page with a post already handled.
6. A cron every 30 minutes schedules the accounts whose `nextSyncAt` is due
   (every 12 hours, or 1 hour after a rate-limited sync). "Check now" runs one
   on demand, at most every 15 minutes.
7. Disconnect deletes the connection and revokes the token at X. Account
   deletion drains both X tables.

**App Review.** Low. It is a standard OAuth consent screen in an
`ASWebAuthenticationSession`, for a feature the user starts. Shelvr's own
sign-in is unchanged (Apple and Google), so guideline 4.8 is not involved.
The privacy policy and App Privacy labels should mention that Shelvr reads X
bookmarks when the user connects X.

**To turn it on (not done; needs Ashish):**

1. Create an X developer app, enable pay-per-use billing, set it as a
   confidential "Web App" client with OAuth 2.0, and add
   `https://<prod deployment>.convex.site/x/oauth/callback` (and the dev one)
   as callback URLs.
2. `npx convex env set X_CLIENT_ID ...` and `X_CLIENT_SECRET ...` on dev first.
3. Deploy the backend, then ship the client by OTA. The client change is
   JavaScript only (`expo-web-browser` is already in the binary).

Until both env vars are set, the connect card is hidden, the cron does
nothing, and the old archive instructions stay on the import screen.

## TikTok

**Possible: only for users in the EEA and UK, and only after TikTok approves
Shelvr.** TikTok's public Display API (Login Kit, `video.list`) only lists the
user's own posts. Favourites and likes are not in it anywhere.

The Data Portability API, built for the EU Digital Markets Act, does include
"Likes and Favourites → Favourite Videos" (date and video link) in its
`activity` category, with `portability.activity.ongoing` for repeat transfers.
But:

- It only covers users in the EEA and UK, and the app must be able to tell
  them apart.
- Approval needs a defined use case, high-fidelity UX mockups, and a privacy
  and security review.
- Transfers are asynchronous: request an export, poll until ready, download
  the archive, parse it.

Cost: no API fee known. Build cost: an approval process plus an async export
pipeline, for the slice of users in Europe. Not worth it at under 50 users,
but worth applying for once Europe is a real market.

## Instagram

**Possible: no, for nearly everyone.** Instagram's APIs (Instagram API with
Instagram Login, the Graph API) are for business and creator accounts managing
their own posts. There is no endpoint for a user's saved posts or collections.
The Basic Display API was shut down on 2024-12-04.

Meta has a DMA data portability route for EU users. A third-party project
reports a saved-posts data type there, but this was not confirmed from Meta's
own documentation, and it is EU-only with its own review. Treat it as
unverified.

Anything else (logging in as the user, scraping saved posts, unofficial APIs)
breaks Meta's terms, risks the user's account, and is the kind of thing that
gets an app rejected or pulled. Not an option.

## What makes TikTok and Instagram feel automatic anyway

- The share sheet already saves a TikTok or Instagram link in two taps.
- Instagram and TikTok both let users download their own data (saved posts,
  favourites) as a file. Accepting that file directly, instead of pasting,
  would make a one-time backfill bearable. It is still a manual export, so it
  is out of scope here.

## Open questions

- Encrypt X tokens at rest? They sit in Convex like other secrets the backend
  holds. Encrypting with a key in an env var would add a key to manage; left
  out to keep it simple.
- Should connecting X be gated on Pro (it is now, like every save)?
- Sync twice a day, or tie a sync to app open as well? Each sync costs about a
  cent when nothing is new.

## Sources

- [X API pay-per-use pricing](https://docs.x.com/x-api/getting-started/pricing)
- [Owned reads now $0.001, effective 2026-04-20](https://devcommunity.x.com/t/x-api-pricing-update-owned-reads-now-0-001-other-changes-effective-april-20-2026/263025)
- [X bookmarks endpoints](https://docs.x.com/x-api/posts/bookmarks/introduction)
- [TikTok Data Portability API](https://developers.tiktok.com/products/data-portability-api/)
- [TikTok Data Portability data types](https://developers.tiktok.com/docs/en/data-portability-data-types)
- [TikTok API scopes](https://developers.tiktok.com/docs/en/tiktok-api-scopes)
- [Instagram Platform overview](https://developers.facebook.com/docs/instagram-platform/overview/)
- [EU DMA end-user data portability](https://digital-markets-act.ec.europa.eu/developer-portal/end-user-data-portability_en)
