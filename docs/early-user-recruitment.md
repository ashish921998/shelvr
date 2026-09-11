# Shelvr: Reddit and short-video launch

Updated September 9, 2026: the founder has no email recipient list. Acquisition
will start with Reddit plus TikTok and Instagram creator-style demos. Email
outreach is not part of this launch.

## First seven days after the instrumented release

| Day | Action | Learning goal |
| --- | --- | --- |
| 1 | One transparent founder post in an eligible Reddit community | Which saving problem attracts interested iPhone users? |
| 2 | Screenshot-chaos video on TikTok and Instagram | Does a visible problem produce profile visits and store clicks? |
| 3 | Respond to genuine comments; collect objections | Is price, trust, or capture friction preventing a trial? |
| 4 | Forgotten-recipe video | Does a specific use case outperform the general organizer pitch? |
| 5 | Travel-saves video | Does finding a saved place make the value clearer? |
| 6 | Film an improved version of the strongest hook | Can the signal repeat? |
| 7 | Review clicks, downloads, first saves and coverage | Choose the next experiment; do not judge immature paid conversion |

## Reddit eligibility

- r/SideProject: candidate for a founder feedback post. The public rules endpoint
  returned no readable rule text during this audit; check the current sidebar and
  account eligibility before posting. It is not marked cleared for publication.
- r/GenAiApps: candidate if AI-first apps are eligible. Its rule page also returned
  no readable rules; verify before publication.
- r/iOSApps: do not use as the first destination without checking eligibility. A
  moderator announcement requires community participation, the Answer/Better/Cost
  format, explicit pricing and a direct App Store link. Subsequent moderation
  reminders mention restrictions on AI-first apps and once-per-30-day promotion.
  Sources conflict on the karma threshold, so verify the live rules rather than
  relying on an old number. Do not farm karma or disguise developer affiliation.

Sources checked September 9:
[iOSApps moderation announcement](https://www.reddit.com/r/iosapps/comments/1t00stp/riosapps_moderation_update_improving_post_quality/),
[moderation reminder](https://www.reddit.com/r/iosapps/comments/1tveiin/removed/),
[SideProject rules](https://www.reddit.com/r/SideProject/about/rules/),
[GenAiApps rules](https://www.reddit.com/r/GenAiApps/about/rules/).

## Reddit post draft

**Title:** I built an iPhone app for screenshots and links I kept losing — looking for feedback

I'm the developer of Shelvr. I kept saving useful things in different places and
then forgetting where they were, so I built a place to save links, photos, and notes
together. It generates titles, summaries, and tags, and files saves into Spaces so
you can search for them later.

If browser bookmarks already work for you, this may be unnecessary. The use case
I'm trying to serve is mixed saves: a screenshot, a recipe link, and a quick note
that belong together without manual filing.

I'd particularly like feedback from iPhone users who save things several times a
week: what do you currently do to find a saved item again, and where does that fail?

Pricing: Shelvr Pro is required for new saves. In the US it's $4.99/month, billed
immediately, or $19.99/year with a seven-day free trial that renews unless cancelled.
Local prices appear before purchase. Existing saves remain read-only if Pro expires.

App Store: https://apps.apple.com/app/id6798143550

No review requests or votes requested. Attach a short real capture/save/search demo
if the destination permits video. Do not post the same copy across communities.

## Three 15–20 second video briefs

Film these as founder-made demos. If a paid creator records them, use the platform's
required commercial disclosure. Do not present scripted actors or generated people
as genuine customers giving testimonials.

| Creative | Opening, 0–3s | Demonstration, 3–14s | Ending, 14–20s |
| --- | --- | --- | --- |
| screenshot_01 | Show a cluttered demo camera roll. “I saved this so I wouldn't forget it.” | Import a screenshot into Shelvr, show its title/Space, search for it | “Saving was easy. Finding it again was the problem.” App name and profile-link CTA |
| recipe_01 | “Where did I save that recipe?” Show switching between saved folders | Share a recipe link into Shelvr; show the recipe in a Space and open it | “One place for the things you want to come back to.” |
| travel_01 | “A trip plan spread across three apps.” | Save a place, a link and a note; show them together and search for the place | “Less hunting through old saves.” |

Use demo content and real current UI. Keep captions readable without audio; put
the result on screen early. Disclose in each caption: “iPhone. Pro subscription
required for new saves. Annual includes a 7-day trial; renews unless cancelled.”
Avoid claiming instant or perfect organization when actual capture/processing takes longer.

## Channel links and measurement

Website links can retain campaign context in the existing `$current_url` event
property. First verify the deployed website emits its page-view/store-click events;
that deployment configuration has not been verified by this document.

- Reddit, where website links are allowed:
  `https://shelvr-web.vercel.app/?utm_source=reddit&utm_medium=organic_social&utm_campaign=launch_1_0_2&utm_content=founder_feedback`
- Instagram bio:
  `https://shelvr-web.vercel.app/?utm_source=instagram&utm_medium=organic_social&utm_campaign=launch_1_0_2&utm_content=bio`
- TikTok bio, if a clickable link is available:
  `https://shelvr-web.vercel.app/?utm_source=tiktok&utm_medium=organic_social&utm_campaign=launch_1_0_2&utm_content=bio`

These URLs are distinct, but **UTMs do not automatically cross the App Store into
the installed app**. Compare aggregate channel intent and production activation;
do not claim per-creative install attribution. Use the direct App Store link where
a subreddit requires it. Record post URLs, creative IDs, publication times, views,
profile visits, link clicks, and comments in the existing organic scorecard.

## Paid ads: later, with a fixed budget

Do not spend before an instrumented production session proves first-open,
onboarding and paywall events arrive and trials remain distinct from payments.
Start with one platform, one audience and the strongest organic creative. A proposed
initial ceiling is $30 total; no budget has been approved and no campaign created.
Evaluate qualified traffic and first saves before mature paid conversion. Stop at
the agreed cap and review. No promised CAC or universal conversion target.

## Publication status

Reddit copy, channel links, and video briefs are prepared. No posts, invitations,
creator engagements, ad purchases, or platform-account changes have been made.
Publication needs the chosen account/community and final rule verification; paid
ads additionally need an explicit budget and target market.
