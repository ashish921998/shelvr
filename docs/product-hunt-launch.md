# Shelvr Product Hunt launch

Prepared 2026-09-08. Status: local preparation; nothing submitted or scheduled.
Launch date and maker account remain to be selected. Organic-first launch.

## Positioning and submission copy

**Name:** Shelvr

**Tagline:** Save screenshots, links and notes. Find them later.

**Description:** Shelvr brings screenshots, links and notes into one searchable collection on iPhone. AI adds titles, summaries and tags, and organizes saves into Spaces. Pro is required for new saves; the annual plan includes a 7-day free trial.

**Pricing:** Paid with a free trial. Monthly bills immediately; the annual plan
renews after its trial unless cancelled. Existing saves remain read-only after
Pro expires. Verify live terms before submission; do not promise a free saving tier.

**Download:** https://apps.apple.com/app/id6798143550

Use the confirmed public marketing homepage as the primary URL, with the App
Store link as an additional link, or use the App Store directly. Product Hunt
does not accept shortened or UTM-tagged primary URLs. Confirm the preferred
homepage before filling the form; repository metadata currently references
https://shelvr-web.vercel.app.

**Suggested topics:** Productivity, Bookmarking, Artificial Intelligence — use
the closest available choices in the submission form.

**Suggested shoutouts:** RevenueCat, Expo, Convex. All are used in the app.

## Maker comment draft

Hey Product Hunt, I'm Ashish, the maker of Shelvr.

Useful things get scattered across screenshots, saved posts, links and notes.
Saving them is easy. Finding them again is the part Shelvr is built for.

Share a link or image to Shelvr, or add a note. Shelvr uses AI to create a title,
summary and tags, organize the save into Spaces, and make it searchable. The
idea is to spend less time filing things and more time using what you saved.

Shelvr is available on iPhone today. Android is planned. Pro is required for
new saves: the annual plan includes a seven-day free trial, while monthly starts
billing immediately. Your existing saves remain readable if Pro expires.

I'd love feedback on one thing: what do you save most often and then struggle
to find again — screenshots, recipes, products, places, or something else?

### Personal story to add before posting

Add two or three factual sentences about the Ship-a-ton experience: what changed
during the event, the hardest product decision, and what was learned. Confirm
the details with Ashish; do not invent an origin story or competition results.

## Creative brief and existing assets

Prepare a square 240 × 240 thumbnail under 3 MB and four 1270 × 760 gallery
cards. Product Hunt requires at least two gallery images. These are briefs,
not completed exports. Review the existing screenshots against the current app.

| Card | Headline | Existing source under apps/native/store-assets/screenshots/en-US |
| --- | --- | --- |
| 1 | Your saved internet, finally useful. | 01-home.png |
| 2 | Share it. Shelvr handles the organizing. | 02-save.png and 03-detail.png |
| 3 | Recipes, trips and ideas, in their own Spaces. | 04-spaces.png |
| 4 | Find the thing you saved. | 05-search.png |

Keep the phone UI large and readable; use one idea per card. Put iPhone
availability on the opening card. Use real product screens and avoid implying
automatic access to every private social post.

An existing ~28-second preview is at
`apps/native/store-assets/preview/shelvr-preview-6.9.mp4`. Its documented flow
shows the feed, item details, Spaces and search. Review it before reuse; a new
clip showing share → automatic organization → search would explain the complete
loop more clearly. Product Hunt accepts a full, non-private YouTube URL for video;
the local MP4 alone is not a submission-ready video link.

## Readiness and schedule

The supplied guide does not set a mandatory launch date. It says scheduled
launches start at 12:01 AM Pacific. In September 2026 that is 12:31 PM IST;
confirm the selected date/time in the scheduler. Do not adopt September 24 from
the separate 2024 RevenueCat article as a 2026 requirement.

### Preparation — start September 8, 2026

- [x] Read the Ship-a-ton guide and current Product Hunt submission guidance.
- [x] Draft the listing and maker comment using repository product facts.
- [x] Locate reusable screenshots and preview footage.
- [ ] Confirm Ashish's personal Product Hunt account and check for any existing Shelvr listing.
- [ ] Choose launch date when the maker can answer comments throughout the day.
- [ ] Confirm the final homepage, current App Store availability and subscription terms.
- [ ] Add the factual Ship-a-ton story to the maker comment.
- [ ] Export and visually check the thumbnail and gallery cards.
- [ ] Review the demo and, if included, publish it to YouTube with appropriate visibility.
- [ ] Enter the listing as a Product Hunt draft and inspect its preview.

### Before scheduling

- [ ] Smoke-test the production install → sign-in → purchase/trial → first save → search flow.
- [ ] Confirm restore purchases and read-only access after Pro expiry.
- [ ] Check homepage download links and Android waitlist behavior.
- [ ] Verify Product Hunt referral visits and `app_store_clicked` reporting in web analytics.
- [ ] Decide whether App Store campaign attribution is available; website clicks alone do not prove installs or first saves.
- [ ] Record baseline first opens, onboarding completions, first saves and subscription starts.
- [ ] Check every claim and asset in the final draft; schedule the selected date.

### Launch day and following week

- [ ] Confirm the listing is live and links work.
- [ ] Share the launch link through the founder's chosen channels and Ship-a-ton community.
- [ ] Add the real Product Hunt badge/link to the website once available.
- [ ] Reply to questions, invite product feedback, and collect concrete problems.
- [ ] Monitor crashes, purchase failures and saving failures.
- [ ] Continue replies for several days and prioritize recurring feedback.
- [ ] Compare acquisition, activation and paid conversion with the baseline after seven days.

Suggested internal targets, not forecasts: 10 substantive feedback conversations,
20 first-save activations if attribution is reliable, and three prioritized
product insights. Record trial and paid starts separately. Do not label all
launch-day installs as Product Hunt conversions.

## Launch announcement draft

Shelvr is live on Product Hunt.

It brings screenshots, links and notes into one searchable collection on iPhone,
with AI organization into Spaces.

If your useful saves keep disappearing into different apps, I'd love your
feedback: [insert live Product Hunt launch URL].

New saves require Pro; the annual plan includes a seven-day trial.

Do not publish until the launch URL exists. Invite feedback, not upvotes.
No outreach has been sent and no promotion or discount has been configured.

## Sources and differences

- [Ship-a-ton Product Hunt Launch Guide](https://app.notion.com/p/teamhome1431/Ship-a-ton-Product-Hunt-Launch-Guide-38e2e1256c9e80ddb025c5012ec1e45a): personal maker account, Ship-a-ton story, community participation, Pacific launch time, feedback-led promotion. No compulsory date stated.
- [Product Hunt preparation guide](https://www.producthunt.com/launch/preparing-for-launch): current submission fields, asset sizes, direct URLs, video support and pricing choices. It permits 500 description characters; the supplied guide says 260. The draft above fits the smaller limit.
- [Product Hunt relaunch policy](https://help.producthunt.com/en/articles/484934-can-i-relaunch-my-product): check current eligibility if an earlier listing exists; major updates do not imply unrestricted immediate relaunches.
- `app-marketing-context.md`: product positioning, platform availability, billing terms and activation events. Production flows have not been retested as part of this preparation.
