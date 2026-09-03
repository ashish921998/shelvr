# Shelvr organic growth sprint

This adapts Post Bridge's [30-day organic growth guide](https://www.post-bridge.com/growth-guide/start-here)
to Shelvr. The guide's account-warmup and “shadowban” explanations are creator
experience rather than official platform guarantees, so treat them as a cautious
operating procedure, not settled algorithm science.

## The bet

Shelvr should not market “AI organization” as an abstract feature. It should
make a familiar mess visible, give one useful idea, and then show the relief:

> scattered save → one-tap capture → useful Space → found again

The first audience is not “productivity people.” It is people who already have
a visible mobile saving habit and feel its cost: hundreds of screenshots,
forgotten Instagram or X saves, and ideas split across apps.

## Conversion path

```text
short video
  → profile visit
  → bio link with campaign tag
  → App Store
  → install / first open
  → onboarding complete
  → first save within 7 days
```

Every post belongs to one pain segment and one format. Keep those identifiers on
the link so downstream quality can be compared. A practical naming convention is:

```text
campaign: organic_2026_09
source: instagram | tiktok
angle: social_graveyard | screenshot_chaos | fragmented_plans
format: confession | demo | list | reaction | pov | before_after
creative: v001, v002, ...
```

Use a redirect or attribution link that can preserve those values through the
App Store. If install attribution is not available yet, track bio-link clicks
immediately and add install-to-first-open attribution before judging conversion.

## Account and profile setup — day 1

Create one Shelvr creator account on Instagram and one on TikTok. Do not create
multiple accounts yet.

Recommended handle, in order of preference:

1. `@shelvrapp`
2. `@getshelvr`
3. `@shelvr.save`

Profile name: `Shelvr · save it for later`

Bio:

> Your screenshots & saved posts—finally findable.
> Save once. Shelvr files it for you. ↓

Use the tracked App Store link on Instagram. Until TikTok allows a clickable
link, put `shelvr.app` (or the canonical Shelvr domain) and the exact app name in
the bio. Use the Shelvr mark as the avatar so the profile is recognizable when
the app appears in a video.

## Research and warmup — days 2–8

Spend 15 focused minutes per platform each day in the niche. Watch fully, save
useful examples, follow selectively, and leave real comments. Do not automate
this behavior.

Build a swipe file with at least 25 posts. For each, record:

- URL and date found
- exact first-frame hook
- duration and visual structure
- why someone keeps watching
- what prompts comments
- Shelvr pain segment it could express
- evidence: views, likes, and comments at capture time

Search around behaviors rather than competitors: “camera roll cleanout,”
“things I saved on Instagram,” “things I sent myself,” “digital clutter,”
“ADHD organization,” recipes, travel planning, and wish lists.

The Post Bridge guide recommends no posts during this period and manual posting
for the first ten posts. Follow that for this experiment so account behavior is
consistent, while recognizing that the causal claims are not independently
verified.

## Content-market-fit tests — days 9–30

Post one short video per day per warmed platform. Cross-posting the same concept
to TikTok and Reels is one creative test, not two. Post manually for the first
ten creatives. Do not add a second account or scheduling tool in this phase.

### Three content pillars

| Pillar | Viewer thought | Product proof |
| --- | --- | --- |
| Social-save graveyard | “I save useful posts on Instagram and X, then never see them again.” | Share a post to Shelvr, auto-file it, and retrieve it outside the feed |
| Screenshot chaos | “I use screenshots as bookmarks and now they are buried under 4,000 photos.” | Save screenshots, auto-file them, then find one again |
| Fragmented plans | “The recipe, hotel, and gift idea are each trapped in a different app.” | Put a link, photo, and note into one useful Space |

### Format ladder

Test formats in this order. Change one major variable at a time.

1. **Relatable confession:** face-to-camera hook, show the mess, one-second app
   reveal, question in the caption.
2. **Before / after:** chaotic camera roll or Saved collection → Shelvr Space → retrieval.
3. **POV:** “POV: you actually find the thing you saved on Instagram last month.”
4. **Useful list:** “3 things to do before your screenshot folder hits 5,000.”
5. **Silent screen demo:** text-led, fast capture and retrieval, native sound.
6. **Reaction / comment reply:** answer a real objection or use case.

The existing files in `apps/native/store-assets/ugc/` supply opening creator
shots for the first three pillars. Extend each with real app footage, captions,
and a result. A face holding a phone without visible product proof is too close
to an ad and does not establish trust.

### First ten creatives

| ID | Angle / format | First-frame hook | Proof beat | Comment prompt |
| --- | --- | --- | --- | --- |
| v001 | Social graveyard / confession | “I save things on Instagram like I’m ever going to find them again.” | Share one post to Shelvr, then retrieve it by search | “How many posts are in your Saved folder?” |
| v002 | Screenshot chaos / confession | “My screenshots were a graveyard of good intentions.” | Save three screenshots into Spaces | “What’s your screenshot count?” |
| v003 | Scattered / confession | “The recipe was in Instagram. The hotel was in Notes. I found neither.” | Recipe, place, and note in one Space | “Where do your saves disappear?” |
| v004 | Social graveyard / before-after | “Before: 2,000 saved posts. After: things I can actually find.” | Instagram Saved → Shelvr Space → search | “Do you ever revisit your saved posts?” |
| v005 | Screenshot / POV | “POV: you can actually find that screenshot from March.” | Search a remembered phrase | “What screenshot do you keep hunting for?” |
| v006 | Scattered / list | “Three places your future plans go to die.” | Instagram, Photos, Notes → one Space | “Which one gets you?” |
| v007 | Social graveyard / demo | “Don’t leave this buried in your Saved folder.” | Share sheet capture and full-text search | “Instagram Saved or screenshots?” |
| v008 | Screenshot / list | “Before deleting screenshots, rescue the useful ones.” | Tidy flow → save → delete | “Would this fix your camera roll?” |
| v009 | Scattered / POV | “POV: your saved internet has a home.” | Mixed-format Space scroll | “What would your first Space be?” |
| v010 | Objection reply | “But I already have Instagram Saved and Photos.” | Show cross-app search, Spaces, and map | “Where do you save things you actually need later?” |

After v010, use the strongest angle twice more with new hooks, then test the next
format. Reserve one or two posts per week for a trend only when it can express a
Shelvr pain naturally; publish within 24–48 hours and do not replace the regular
test.

## Creative recipe

Each post should be 6–15 seconds until the data argues for longer:

1. **0–1.5s:** state or show the mess. No logo intro.
2. **1.5–5s:** heighten recognition or teach one useful behavior.
3. **5–10s:** show Shelvr completing a real job.
4. **Final frame:** a result, not a feature list.

Caption pattern:

> [Useful or relatable thought]. I use Shelvr to [specific outcome]. [Question]

Pinned comment pattern:

> It’s called Shelvr — [specific promise for this post]. Link in bio.

Avoid “download my app,” generic AI claims, feature tours, and polished brand
intros. The product mention should complete the story rather than interrupt it.

## Scorecard and decision rules

Record results after 24 hours and again after seven days. Compare posts within
the same platform; raw TikTok and Instagram view counts are not interchangeable.

| Layer | Metric | What it diagnoses |
| --- | --- | --- |
| Attention | 1-second hold, average watch time, completion | Hook and edit |
| Resonance | shares, saves, comments per 1,000 views | Pain and usefulness |
| Intent | profile visits and bio clicks per 1,000 views | Product relevance |
| Acquisition | store views and installs per bio click | Store promise / attribution |
| Activation | onboarding completion and first save per install | Product-message fit |
| Quality | day-7 retention, deletion, suggestion acceptance | Whether acquired users fit |

Decisions:

- **Kill a hook** after three materially different executions all miss the
  account's median attention and intent.
- **Keep testing an angle** when attention is average but qualified comments,
  profile visits, or activations are strong.
- **Call a format promising** after it beats the rolling median on both attention
  and intent twice.
- **Call a format a winner** after three posts reproduce the lift and acquisition
  reaches first-save activation.
- **Never scale on views alone.**

## Weekly operating rhythm

### Monday

- Review the prior seven-day scorecard.
- Choose four iterations of the best signal and three exploration posts.

### Tuesday–Friday

- Shoot or assemble one post daily.
- Reply to early comments as a person, not a support account.
- Save audience wording and objections for future hooks.

### Saturday

- Publish one high-risk format or trend adaptation.
- Turn the best comment into next week's response video.

### Sunday

- Batch app screen recordings and rough cuts.
- Update the swipe file and pre-assign campaign IDs.

## Scaling gate — day 30+

Scale only when all of these are true:

- at least 30 days of consistent testing;
- two or three reproducible formats;
- at least one meaningful reach breakout (use 100,000 views or several above
  10,000 as a guide, not the sole requirement);
- tracked App Store traffic and activated users from organic content;
- a weekly production process the team can sustain.

Then increase the main account to two posts a day, spaced several hours apart.
Only after that works should Shelvr warm a second account or add YouTube Shorts.
Use Post Bridge or another scheduler after the first ten manual posts on each new
account and only to distribute already-proven creative.

## Before day 1

- [ ] Confirm the canonical domain and claim `@shelvrapp` or the closest handle.
- [ ] Create one Instagram and one TikTok account with the bio above.
- [ ] Create one tracked bio link per platform.
- [ ] Ensure the link-to-install path can be tied to first open and first save.
- [x] Create the scorecard with one row per creative ID and platform
  (`docs/organic-growth-scorecard.csv`).
- [ ] Collect baseline App Store conversion and product activation rates.
- [ ] Export clean screen recordings for capture, auto-filing, search, and Tidy.
- [ ] Begin the seven-day swipe-file and account-warmup routine.
