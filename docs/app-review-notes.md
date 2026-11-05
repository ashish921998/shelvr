# App Review notes for Shelvr

Use these notes in App Store Connect when submitting Shelvr for review.

## Account access

- Sign in with **Sign in with Apple** or **Google**.
- No password account is required.
- Reviewer path: onboarding opener → "How many places have you saved?" → "What would you like to plan?" → "How do you like to plan?" → a city → a sample reel → its spots on a map → a three-slide carousel → notifications → paywall (three screens, ending in the plan picker where you buy or start the trial in the sandbox) → **Continue with Apple** → Home. The notifications screen is skipped when iOS already has an answer. The paywall fills the screen. While the free plan is on, closing it finishes onboarding without a purchase and goes on to sign-in, then Home on the free plan (10 free saves); with the free plan turned off on the server, closing returns to the screen before it. A purchase or restore also leads to sign-in, and no account is created before then. Anyone whose paywall cannot load also goes on to sign-in and Home (with the free plan off, sign-in leads to the plan screen instead), and an account that already has Pro skips the paywall. Existing accounts can use **Already have an account? Sign in** on the opener.
- App Review can use its own Apple account through Sign in with Apple; no developer-issued credentials, one-time code, invitation, or special account state is required.
- A dedicated Google test account is optional fallback access. If one is supplied, enter the credentials in App Store Connect only, never in this repo or the app binary.
- Anonymous / "Continue without account" is **dev-only** and disabled in production builds.

## Onboarding

1. **Opener:** three pages that swipe sideways, each over a drawn phone, with headlines that open "Saved it.", "Your places," and "Make plans". The pages move on every few seconds until the user swipes, and stay put with Reduce Motion on. Under every page are a **Get started** button and an **Already have an account? Sign in** link.
2. **How many places have you saved?:** one answer of **Just a few**, **10 to 50**, **50 to 200**, **Hundreds** or **I've lost count**. **Continue** waits for an answer; **Skip** at the top right moves on without one.
3. **Echo of the first answer:** a statement screen repeats the saved-count answer back (as hundreds of places when it was skipped) with one button, **That’s me 😩**. No answer is stored from it.
4. **What would you like to plan?:** any of **Date nights**, **Trips** and **Places to eat**, or **A bit of everything** for all three. Each starts the shelf with one space (Date nights, Travel, Restaurants to try). **Continue** waits for at least one; **Skip** picks all three.
5. **Are you planning a trip soon?:** one tap on **Yes, I’m planning one** or **Not yet** moves on. It is asked only when Trips or A bit of everything was picked, or the goal question was skipped; otherwise it is left out.
6. **How do you like to plan?:** one of **Planner**, **Flexible**, **Spontaneous** or **Explorer**. The answer is recorded in analytics and changes nothing else yet. **Skip** moves on.
7. **City:** photo tiles of cities, plus "Not sure yet" (when Trips is picked without Date nights) or "Somewhere else". The title is "Where are you going?" after a yes to the trip question, "Where do you go out?" otherwise, and "Where’s your dream city?" when all three goals apply and no trip is planned. One tap picks a city and moves on. The answer is retained; when that city has no sample reel, the demonstration uses Austin for the same goal instead.
8. **Echo of the city:** a statement screen names the city whose reel the demonstration plays, and praises the pick only when it is that city. One button, **Continue**.
9. **Sample reel:** "Try saving this reel." shows a real public Instagram reel labelled a sample, muted, credited to its creator. Austin, New York, Los Angeles, Chicago and San Francisco have reels for each goal; other city choices and a skipped city use Austin's reel for that goal. The app loads the reel's public embed page out of sight and plays its video in its own player, over the sample city's photo, which stays when the reel cannot load. The map and carousel use that reel's city and first three places. The video cannot be tapped. Everything after it is drawn inside the app (not the system share sheet), one tap per screen, with a pill naming the tap:
   - **Share** on the post opens a drawn Instagram share panel; **Share to…** opens a drawn iOS share sheet; **More** opens a drawn Apps list with **Shelvr** selectable immediately. Tapping it shows "Finding the spots…" for about a second and moves on. The demo has no pinning or Favorites-editing steps and does not change the real share sheet. Nothing is shared or saved and Shelvr's servers are not called; the only network use on this screen is the reel's video loading from Instagram.
   - **First save:** a centered statement screen congratulates the first save, with light confetti (none with Reduce Motion) and **Continue**.
   - **Spots:** a preview of the city page the save lands on. A full-width map, labelled "Added to" the city, drops a pin for each of the reel's first three places in video order. A sheet under it names the city with the count of places, credits the reel's creator, and lists the place names. **Continue** opens the next screen.
   - **Carousel:** three slides, "Plan it together with your people.", a second slide retiring the where-should-we-eat question, and "Every place you saved, on one map.", each over a drawn card built from the sample. Tapping a card or swiping moves to the next slide; **Continue** advances a slide, and on the last moves on.
   - **Notifications:** "Don’t miss the places you saved." shows two sample reminders built from the same sample: the evening before a trip, and a saved place the user has not been to. **Turn on reminders** shows the iOS notification permission, and either answer opens the paywall. **Not now** opens the paywall without asking. The screen is skipped when iOS already has an answer, whichever it was. Reminders are optional: nothing in the app depends on them.
   - Every screen after the opener has a back button to the screen before.
   - The reel's link is kept on the device and saved to the account as its first save once the account is signed in, as if the user had shared it. On the free plan it uses one of the 10 free saves.
10. **Paywall:** the RevenueCat paywall, which has three screens. The opener, "Save the link. Shelvr does the filing.", shows a short carousel of what Shelvr does and has **Continue**. The trial explainer, "Get a heads-up before you pay", describes the 7-day trial on the Annual plan, which the paywall labels Yearly: Today, a reminder before the trial ends that is sent only if the user turns it on, and Day 7, when annual billing begins. It says to cancel at least 24 hours before the trial ends to avoid a charge, and where to cancel (Settings > your name > Subscriptions). **See plans** continues. The plan picker, "Pick a plan", offers **Yearly** (7-day trial, then the yearly price) and **Weekly** (no trial), each with its localized price. The buy button reads "Try for $0.00, then <price>/year" for Yearly with the trial (the zero is shown in the storefront's currency), and "Subscribe for <price>/week" for Weekly. The renewal line above the button, **Restore**, **Terms**, and **Privacy** are on this screen. These three screens are the offering for an account that can still start the trial, which includes a fresh sandbox account. An account that has already used its trial is shown a separate no-trial offering instead, which this note does not cover. The paywall fills the screen. Its first screen has a back arrow that closes it; during onboarding, while the free plan is on, closing finishes onboarding and goes on to sign-in, then Home on the free plan (with it off, closing returns to the screen before). Its second and third screens can go back to the paywall screen before them. Anyone whose paywall cannot load also goes on to sign-in and Home (with the free plan off, sign-in leads to the plan screen instead), and an account that already has Pro skips the paywall. After a purchase or restore, Shelvr asks for Sign in with Apple or Google, attaches the purchase to the new account, and saves anything the user shared to Shelvr meanwhile. Once a trial has started, a sheet titled "Want a heads-up before you're charged?" offers the trial reminder when notifications are off and iOS can still ask, and its **Remind me** button asks for the iOS notification permission.
11. **Home:** a one-time letter, "Plan less, go out more", with **Explore Shelvr** to close it. After onboarding and sign-in, on the free plan or with Pro, the demonstrated reel is saved through the normal link-reading flow. It appears under "Finding places…" during reading, then under its city when places are found. If Apple shared no name with Shelvr, a sheet asks "What should we call you?" once; **Skip for now** closes it.
12. Camera and Photo Library are **not** requested, during onboarding or after. This build has no camera or photo import.
13. Shelvr never asks for an App Store rating during onboarding. The system prompt is eligible only after the user has at least three successfully processed saves, when they return to Home from a save they opened, and never on launch or in an account's first session. Shelvr requests it at most once in total.

## Core save loop

- **Link:** tap Add, paste an Instagram Reel or TikTok link (any page link is accepted), and save. Processing saves appear under "Finding places…". Once processing finishes, saves with a city appear as a city card on Home, under the Plan a date and Plan a trip tiles. If a save the user is watching fails or names no place, a banner says "Couldn't find places in that link" with **Retry** (or **View** when a retry can't help). Every failed or placeless save is counted in one line under the cities (for example, 2 saves without a place), whose **Review** opens a sheet with **Retry** and **Delete** for each. Notes, photos and the camera are not part of this build.
- **Free plan:** an account without Pro gets 10 free saves. A save holds a slot while it is being read and keeps it once it finishes with a place in a city; a failed or placeless save gives its slot back, as does deleting a save still being read, but deleting a placed save does not. A shared Google Maps list counts as one save. With 2 or fewer left, Home shows a card with the count and **See plans**. Once all 10 are used, Add, Retry and the share sheet open the paywall; the share sheet can keep the link and save it right after a purchase. Existing saves, city pages and Map stay open.
- **Share Sheet:** From Safari, Instagram or TikTok, share to Shelvr. While signed in, content saves automatically. While signed out, Shelvr preserves the intent and resumes after sign-in. During onboarding, a shared link is held on the device until sign-in. If the app is relaunched or interrupted mid-save, the pending marker and local session resume the flow on the next launch; successful completion or explicit abandonment clears them. If native payload cleanup fails, the completed session stays available for **Try again** or **Cancel**.

## Shared lists

- A shared list is one list of places that up to 8 people keep together. A person can be on 20 lists, and a list holds up to 200 places.
- Home shows the person's lists above the Plan a date and Plan a trip tiles. A list starts from a city page's "Invite" button, beside the city's name.
- Starting a list needs Pro. The form takes a name and at least one city; places the owner already saved in those cities come along. "Send invite" opens the share sheet with a link to `https://shelvr-web.vercel.app/l/<token>`.
- With Shelvr installed, the link opens the Join screen, which says "Free to join. You don’t need Pro." and has "Join list". Without the app, the web page shows the invite. A person who isn't signed in joins after sign-in, finishing onboarding first if they need to.
- Joining, opening the list, marking a place "We went" and leaving need no Pro. While the owner has Pro, a member without it can also add places and plan a date or a trip from the list. Everywhere else they still see the plan screen.
- Members see the list's name, its places with their pins and cities, the first name of whoever added each place, and "We went" marks. They don't see each other's saves, titles or captions. A place's source save opens only for the person who saved it.
- The owner can "Remove" a member. That member loses the list, the old invite link stops working, and the places they added stay. Anyone can "Leave list". When the owner leaves, the oldest member whose account isn't being deleted becomes the owner. When no such member is left, the list is deleted.
- There is no report or block control. A list name is free text, and anyone holding a live link can join until the list is full. Removing a member is the only control, and it also replaces the link.

## Pro / subscriptions (RevenueCat sandbox)

- Shelvr Pro gates saves past the 10 free ones, Plan a date, Plan a trip, editing or removing a save's places, and starting a shared list. On Home the Plan a date and Plan a trip tiles carry a Pro tag for free accounts, and tapping one opens the paywall.
- Plans: **Annual** (labelled Yearly on the paywall; 7-day trial, then the yearly price) and **Weekly** (no trial). Both auto-renew until canceled.
- Lapsed subscribers are on the free plan: their existing saves stay open, and saves made while they had Pro do not count toward the 10.
- Present paywall from any gated action or Profile → View Pro plans.
- The paywall fills the screen, and the back arrow on its first screen closes it and returns to the screen that opened it. A signed-in account without Pro uses the app on the free plan and does not see the plan screen ("Pick a plan to open Shelvr"); that screen appears only if the free plan is turned off on the server.
- **Restore Purchases** is available in Profile → Settings and on the plan picker, the last paywall screen. Subscription management is available through Profile → Pro / View Pro plans.
- Verify sandbox products show localized price, trial, renewal text, Terms, Privacy, and Restore on the plan picker.
- Backend entitlement is Convex `subscriptions` updated by the RevenueCat webhook, so expect a brief delay after purchase. Pull to refresh or reopen Profile if needed.

## Previous App Review issues

- **Build 9, Guideline 2.1(a):** Sign in with Apple was unresponsive and Google sign-in ended in an error. Authentication now uses the production `shelvr://auth/callback` OAuth return path for both providers.
- **Build 13, Guideline 5.6.3:** onboarding asked for an App Store rating before the user experienced the product. The onboarding rating step was removed, and onboarding still has none. The system prompt is now eligible only after three successfully processed saves, when the user returns to Home from a save they opened.
- **Builds 14 and 16, Guideline 2.1(b):** Apple's sandbox purchase flow displayed RevenueCat Error 23. The rejected build 14 artifact contained a different RevenueCat public SDK key from the current App Store app. Production builds now fail before compilation unless EAS supplies an `appl_` App Store key and an HTTPS Convex URL. Before resubmission, inspect the new IPA and complete a clean sandbox purchase on iPhone, and on iPad in iPhone compatibility mode (`supportsTablet` is false, so there is no native iPad layout).

## Account deletion

- Profile → Settings → **Delete account**.
- Deleting an account that used Sign in with Apple also revokes its Apple token, when Shelvr holds one. Shelvr started keeping that token with this release, so an account that last signed in before it has none: its deletion still removes everything, the revocation is skipped, and signing in again once stores a token.
- Confirmation explains what is deleted (saves, places, identity) and that **App Store subscriptions are not cancelled** by account deletion. A user with an active subscription or trial also gets a **Manage subscription** button on that confirmation.
- Deletion also removes the places the user added to shared lists and takes them off every list, as if they had left it.
- After success the user is signed out.

## Legal and support

- Sign-in: tappable **Terms** and **Privacy Policy** (https://shelvr-web.vercel.app/terms, https://shelvr-web.vercel.app/privacy).
- Profile → Settings: Contact Support, Restore Purchases, Terms, and Privacy.
- Paywall fallback (only on SDK/network failure): Terms and Privacy links plus retry.

## Permissions

| Permission    | When requested                                                 | Why                                               |
| ------------- | -------------------------------------------------------------- | ------------------------------------------------- |
| Calendar      | User adds an event from an item intent                         | Create calendar event from saved content          |
| Location      | The Map tab opens for the first time                           | Center the map on the user; Map works without it  |
| Notifications | "Turn on reminders" in onboarding, or the trial reminder sheet | Reminders about saved places, trips and the trial |

Shelvr does **not** record microphone audio and does not request microphone access in production.

## Privacy disclosures (summary)

- Account email via Apple/Google.
- Saved URLs, extracted page content and spoken words, and the places Gemini finds in them (AI runs automatically unless the account has a previously recorded opt-out).
- Place names sent to Apple Maps to pin a trip's stops (no live location tracking).
- Shared list members see the list's places and each other's first names.
- RevenueCat subscription status.
- PostHog product analytics (not ads).

## Backend / network

- Requires network access to the production Convex deployment and RevenueCat.
- AI classification and link extraction require outbound network from the backend.

## Bundle

- App: `app.shelvr.save`
- Share extension: `app.shelvr.save.expo-sharing-extension`
- App Group: `group.app.shelvr.save`

## Before submitting

- Run `pnpm run check` and test the signed production build on a physical iPhone.
- Confirm `EXPO_PUBLIC_CONVEX_URL` and `EXPO_PUBLIC_REVENUECAT_IOS_KEY` exist in the EAS production environment.
- Confirm the production Convex deployment has working Apple/Google OAuth, AI, and RevenueCat webhook configuration.
- Confirm the Weekly and Annual subscriptions are attached to the submission, available in every intended territory, and render localized prices and renewal periods on the plan picker.
- Confirm the Annual 7-day trial offer is available in every intended storefront. Generic app actions use **View Pro plans** because the Weekly plan does not include a trial.
- Confirm App Privacy is published and matches `apps/native/privacy.json`, `ios.privacyManifests`, and the hosted Privacy Policy.
- Add complete contact information and the notes below to App Review Information.
- Attach the preview video from `shelvr-notes/store-assets/preview/` as the review demo if it reflects the submitted build; otherwise record a fresh walkthrough of sign-in, onboarding, paywall, saving a reel link, a city page, restore, and account deletion.
- Remove every unresolved review issue or mark it resolved before resubmitting.

## Paste-ready App Review notes

This is the text submitted with 1.0.13 (build 53), except that its first core review step named a Home heading that does not exist, and that it now describes the free plan (10 free saves, a closable onboarding paywall) shipped after that build. App Store Connect allows 4,000 characters, and it is about 4,000, so cut a line for each line you add.

New in 1.0.13: shared lists, and a Trips tab that plans and edits a day-by-day trip for a city.

Shelvr is a private save-it-for-later app for Instagram Reels and TikToks. It uses AI to find the places a post names and file them under a city. It has no feed, no messaging and no public profiles. A user can share one save through an unlisted link, or invite people to a shared list.

Account access:

1. Launch Shelvr and tap "Get started".
2. Answer "How many places have you saved?", "What would you like to plan?" and "How do you like to plan?" (tap an answer, then "Continue", or "Skip"), tap an answer on the trip question if it appears, then tap a city.
3. On the sample reel, follow the pills: Share, Share to…, More, then Shelvr. This is a demonstration drawn inside the app; the reel becomes a real save after onboarding and sign-in.
4. After the paywall in the next section, Shelvr asks you to sign in: choose Continue with Apple. App Review may use its own Apple account; no invitation or code is needed.

Subscription testing:

1. After the sample reel, tap "Continue" on its spots and through the carousel. If a reminders screen appears, tap "Turn on reminders" or "Not now". The RevenueCat paywall (Apple sandbox) opens. Close skips buying: you sign in on the free plan (10 free saves; plans need Pro).
2. The paywall has three screens: "Save the link. Shelvr does the filing.", "Get a heads-up before you pay", and "Pick a plan". Tap Continue, then See plans, then buy or start the trial with a sandbox account. Sign-in follows the purchase or restore.
3. Weekly and Annual (labelled Yearly) auto-renewing subscriptions are available. Annual includes a 7-day free trial for accounts that have not used one; Weekly has no trial.

Core review flow:

1. From Home, tap Add, paste an Instagram Reel or TikTok link, and save. The save first shows processing, then the places it names appear under their city on Home. A link that names no place is counted in one line under the cities, with Review.
2. Tap a city to open its page: a map with a pin per place and a list of the places.
3. On the city page, tap "Plan a date", pick a kind of date, and get an evening of two stops a short walk apart (Apple Maps may suggest one). Tap "Plan a trip" (or use the Trips tab) for a day-by-day trip: saved places first, suggested places from Apple Maps filling the gaps. A trip's menu has Edit trip, Add a place and Delete trip.
4. Tap Map for every pinned place on one map, with search and filters. Shelvr asks for location only when Map first opens, to center it on you; Map works without it.

Shared lists:

A list holds places kept by people its owner invites, at most 8. Open a city from Home, tap "Invite", enter a name, then "Send invite" to get a link in the share sheet. Anyone with the link can join; joining needs a second account, the list works with one. Members see the list's name, its places and each other's first names. The owner can "Remove" a member, which also stops the old link. Anyone can "Leave list".

Share extension, Siri and widget:

1. In Safari, Instagram or TikTok, tap Share on a post and choose Shelvr. The link saves without leaving that app.
2. In the Shortcuts app, open Shelvr and run "Save a Link". The same action works through Siri.
3. The "Recent Saves" widget shows the latest saves.

Third-party AI:

To find the places in a saved reel or TikTok, Shelvr sends its caption and spoken words to Google Gemini. Planning does not send the saved collection or visit history to Gemini.

Account and support controls:

- Profile contains subscription management and Sign out. Profile > Settings contains Contact Support, Restore Purchases, Terms of Service, Privacy Policy, and Delete account.
- Delete account permanently removes the user's saves, places (shared list additions too), subscription record, and authentication identity. It does not cancel an App Store subscription, which remains managed by Apple.
