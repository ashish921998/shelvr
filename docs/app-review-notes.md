# App Review notes for Shelvr

Use these notes in App Store Connect when submitting Shelvr for review.

## Account access

- Sign in with **Sign in with Apple** or **Google**.
- No password account is required.
- Reviewer path: onboarding opener → "How many places have you saved?" → "What would you like to plan?" → "Where have you been?" (tap cities, then **Continue**, or **Skip**) → a chart from scattered saves to a plan (**Continue**) → a city → the city statement (**Continue**) → a sample reel → a first-save screen (**Continue**) → its spots on a map → a three-slide carousel → notifications → paywall (three screens, ending in the plan picker where you buy or start the trial in the sandbox) → **Continue with Apple** → the Map. Every onboarding screen after the opener, up to the paywall, has **Skip** at the top right. It moves to the next screen without requiring another answer. On the sample reel it goes straight to its spots, past the first-save screen. The notifications screen is skipped when iOS already has an answer. The paywall fills the screen. While the free plan is on, closing it finishes onboarding without a purchase and goes on to sign-in, then the Map on the free plan (10 free saves); with the free plan turned off on the server, closing returns to the screen before it. A purchase or restore also leads to sign-in, and no account is created before then. Anyone whose paywall cannot load also goes on to sign-in and the Map (with the free plan off, sign-in leads to the plan screen instead), and an account that already has Pro skips the paywall. Existing accounts can use **Already have an account? Sign in** on the opener.
- App Review can use its own Apple account through Sign in with Apple; no developer-issued credentials, one-time code, invitation, or special account state is required.
- A dedicated Google test account is optional fallback access. If one is supplied, enter the credentials in App Store Connect only, never in this repo or the app binary.
- Anonymous / "Continue without account" is **dev-only** and disabled in production builds.

## Onboarding

1. **Opener:** four labeled previews show Your cities, the San Francisco map with pins for saved places, two date stops with the walking time and **Send to your date**, and a trip itinerary with stops grouped by day. The carousel advances every three seconds until the user swipes. Reduce Motion, a screen reader, or large text keeps the carousel on its current preview until the user moves it. The **Get started** button and **Already have an account? Sign in** link stay below the carousel.
2. **How many places have you saved?:** one answer of **Just a few**, **10 to 50**, **50 to 200**, **Hundreds** or **I've lost count**. **Continue** waits for an answer; **Skip** at the top right moves on without one.
3. **What would you like to plan?:** any of **Date nights**, **Trips** and **Places to eat**, or **A bit of everything** for all three. Each starts the shelf with one space (Date nights, Travel, Restaurants to try). **Continue** waits for at least one; **Skip** picks all three.
4. **Where have you been?:** photo tiles of 25 cities with a "Search cities" field; any number can be picked. **Continue** waits for at least one; **Skip** moves on with none. The picks stay on the device until sign-in, then are saved to the account as city stamps in the Passport, on the free plan too; when cities were picked, the paywall's first headline counts them. Adding more cities later, from **I’ve been to…** in the Passport, needs Pro. No location is read.
5. **Chart:** the headline "Let’s put your saves to use.", and a curve that draws itself from "Lost in your saves" (Now) to "Date night planned", "Trip planned" or "Weekend planned", following the goals. It is drawn already with Reduce Motion on. **Continue** moves on.
6. **City:** photo tiles of the 25 cities, plus "Not sure yet" (when Trips is picked without Date nights) or "Somewhere else". The title is "Where’s your next trip?" when Trips is picked without Date nights, and "Where do you go out?" otherwise. One tap picks a city and moves on. The answer is retained, and the demonstration plays that city's reel.
7. **Echo of the city:** a statement screen names the city whose reel the demonstration plays, and praises it when the person picked it. One button, **Continue**.
8. **Sample reel:** "Try saving this reel." shows a real public Instagram reel labelled a sample, muted, credited to its creator. Each of the 25 cities has its own reel about the city's hidden gems, used for every goal; a skipped city uses Austin's reel. The app loads the reel's public embed page out of sight and plays its video in its own player, over the sample city's photo, which stays when the reel cannot load. The map and carousel use that reel's city and three of its places. The video cannot be tapped. Everything after it is drawn inside the app (not the system share sheet), one tap per screen, with a pill naming the tap:
   - **Share** on the post opens a drawn Instagram share panel; **Share to…** opens a drawn iOS share sheet; **More** opens a drawn Apps list with **Shelvr** selectable immediately. Tapping it shows "Finding the spots…" for about a second and moves on. The demo has no pinning or Favorites-editing steps and does not change the real share sheet. Nothing is shared or saved, and no save or place lookup is sent to Shelvr's servers. The reel's embed page and video load from Instagram, and product analytics record the step, as on every onboarding screen.
   - **First save:** a centered statement screen congratulates the first save, with light confetti (none with Reduce Motion) and **Continue**.
   - **Spots:** a preview of the city page the save lands on. A full-width map, labelled "Added to" the city, drops a pin for each of three places the reel names, in its order. A sheet under it names the city with the count of places, credits the reel's creator, and lists the place names. **Continue** opens the next screen.
   - **Carousel:** three slides, "Plan it together with your people.", a second slide retiring the where-should-we-eat question, and "Every place you saved, on one map.", each over a drawn card built from the sample. Tapping a card or swiping moves to the next slide; **Continue** advances a slide, and on the last moves on.
   - **Notifications:** "Don’t miss the places you saved." shows two sample reminders built from the same sample: the evening before a trip, and a saved place the user has not been to. **Turn on reminders** shows the iOS notification permission, and either answer opens the paywall. **Not now** and **Skip** open the paywall without asking. The screen is skipped when iOS already has an answer, whichever it was. Reminders are optional: nothing in the app depends on them.
   - Every screen after the opener has a back button to the screen before.
   - The reel's link is kept on the device and saved to the account as its first save once the account is signed in, as if the user had shared it. On the free plan it uses one of the 10 free saves. After **Skip** on the sample reel, nothing is saved.
9. **Paywall:** the RevenueCat paywall, which has three screens. The opener, "Save the link. Shelvr does the filing.", shows a short carousel of what Shelvr does and has **Continue**. The trial explainer, "Get a heads-up before you pay", describes the 7-day trial on the Annual plan, which the paywall labels Yearly: Today, a reminder before the trial ends that is sent only if the user turns it on, and Day 7, when annual billing begins. It says to cancel at least 24 hours before the trial ends to avoid a charge, and where to cancel (Settings > your name > Subscriptions). **See plans** continues. The plan picker, "Pick a plan", offers **Yearly** (7-day trial, then the yearly price) and **Weekly** (no trial), each with its localized price. The buy button reads "Try for $0.00, then <price>/year" for Yearly with the trial (the zero is shown in the storefront's currency), and "Subscribe for <price>/week" for Weekly. The renewal line above the button, **Restore**, **Terms**, and **Privacy** are on this screen. These three screens are the offering for an account that can still start the trial, which includes a fresh sandbox account. An account that has already used its trial is shown a separate no-trial offering instead, which this note does not cover. The paywall fills the screen. Its first screen has a back arrow that closes it; during onboarding, while the free plan is on, closing finishes onboarding and goes on to sign-in, then the Map on the free plan (with it off, closing returns to the screen before). Its second and third screens can go back to the paywall screen before them. Anyone whose paywall cannot load also goes on to sign-in and the Map (with the free plan off, sign-in leads to the plan screen instead), and an account that already has Pro skips the paywall. After a purchase or restore, Shelvr asks for Sign in with Apple or Google, attaches the purchase to the new account, and saves anything the user shared to Shelvr meanwhile. Once a trial has started, a sheet titled "Want a heads-up before you're charged?" offers the trial reminder when notifications are off and iOS can still ask, and its **Remind me** button asks for the iOS notification permission.
10. **After sign-in:** the app opens on the Map. Over whichever tab is open, Map or Library, a one-time letter, "Plan less, go out more", greets an account that had no saves when it signed in after onboarding, or that has just started Pro or a trial; **Explore Shelvr** closes it. The letter shows only while the account has Pro or a trial, so a free account sees it once it starts one. After onboarding and sign-in, on the free plan or with Pro, the demonstrated reel is saved through the normal link-reading flow, unless **Skip** was tapped on the sample reel. It appears under "Finding places…" during reading, then under its city when places are found. If Shelvr has no first name for the account, a sheet over the open tab asks "What should we call you?" once; **Skip for now** closes it.
11. Onboarding asks for no Camera or Photo Library permission, and Shelvr never uses the camera. Photos reach Shelvr when the user shares them to it, saves them with a Shortcuts or Siri action, or picks a trip cover. In a new trip, **Add cover photo** opens the system photo picker, which needs no Photo Library permission, and the chosen photo is shrunk and stored with that trip. Saving a photo needs Pro.
12. Shelvr never asks for an App Store rating during onboarding. The system prompt is eligible only after the user has at least three successfully processed saves, when they return to the Map or Library from a save they opened, and never on launch or in an account's first session. Shelvr requests it at most once in total.

## Core save loop

- **Link:** tap the + button in the tab bar, then **Paste a link**, paste an Instagram Reel or TikTok link (any page link is accepted), and save. While Shelvr reads a save, Library lists it under Recents with "Finding places…". Once reading finishes, its places appear on the Map and under their city, which Library's Cities row opens. If a save the user is watching fails or names no place, a banner says "Couldn't find places in that link" with **Retry** (or **View** when a retry can't help). Library's "Without a place" row counts the failed and placeless saves among those it has loaded. It opens a sheet with **Delete** for each save, and **Retry** for a save that a retry can help. The + button takes links only. Text and photos can be saved from the share sheet, and photos also through Shortcuts and Siri ("Save an Image"). Photos need Pro. The app has no camera.
- **Free plan:** an account without Pro gets 10 free saves. A save holds a slot while it is being read and keeps it once it finishes with a place in a city; a failed or placeless save gives its slot back, as does deleting a save still being read, but deleting a placed save does not. A shared Google Maps list counts as one save. With 2 or fewer left, Library shows a card with the count and **See plans**. Once all 10 are used, adding a save in the app, Retry and the share sheet open the paywall; the share sheet can keep the link and save it right after a purchase. Existing saves, city pages and Map stay open.
- **Share Sheet:** From Safari, Instagram, TikTok or Photos, share to Shelvr, which opens the app. While signed in, content saves automatically. A photo needs Pro, and without it the screen says "Photos need Pro". While signed out, Shelvr preserves the intent and resumes after sign-in. During onboarding, a shared link is held on the device until sign-in. If the app is relaunched or interrupted mid-save, the pending marker and local session resume the flow on the next launch; successful completion or explicit abandonment clears them. If native payload cleanup fails, the completed session stays available for **Try again** or **Cancel**.

## Shared lists

- A shared list is one list of places that up to 8 people keep together. A person can be on 20 lists, and a list holds up to 200 places.
- Library's Collections row opens Collections, which shows the person's lists. Trips has its own row. A list starts from a city page's "Invite" button, beside the city's name, from "Start a shared list" on the "Add spots" sheet, or from "New collection" in Collections.
- Starting a list needs Pro. The form takes a name and at least one city; places the owner already saved in those cities come along. "Send invite" opens the share sheet with a link to `https://tryshelvr.app/l/<token>`. A list started in Collections has "Create collection" instead, and its invite is sent later from the list's "Invite" button.
- With Shelvr installed, the link opens the Join screen, which says "Free to join. You don’t need Pro." and has "Join list". Without the app, the web page shows the invite; after installing, while the invite link is on the clipboard (the web page copies it), the first screen and the sign-in screen offer "Invited to a list?" with "Join it", which opens the same Join screen. A person who isn't signed in joins after sign-in, finishing onboarding first if they need to.
- Joining, opening the list, marking a place "We went" and leaving need no Pro. While the owner has Pro, a member without it can also add places and plan a date or a trip from the list. Everywhere else they still see the plan screen.
- Members see the list's name, its places with their pins and cities, the first name of whoever added each place, and "We went" marks. They don't see each other's saves, titles or captions. A place's source save opens only for the person who saved it.
- When another member adds places, the list's card in Collections and the top of the list say who added how many, those places head the list, and their pins drop onto the map one by one. Once the list has been opened, those places are no longer new.
- The owner can "Remove" a member. That member loses the list, the old invite link stops working, and the places they added stay. Anyone can "Leave list". When the owner leaves, the oldest member whose account isn't being deleted becomes the owner. When no such member is left, the list is deleted.
- There is no report or block control. A list name is free text, and anyone holding a live link can join until the list is full. Removing a member is the only control, and it also replaces the link.

## Vote links

- A city page with places shows "Ask someone" under the place count. Making a vote link needs Pro, and without Pro the row opens the paywall.
- The sheet lists the city's places, and up to 5 can be picked. "Send vote link" opens the share sheet with a link to `https://tryshelvr.app/p/<token>`.
- Voters need no app or account. They tap ✓ or ✕ on each place and may type a first name. The page shows the sender's first name, the city and the places, with a saved link's cover image but never a photo save.
- Votes appear on the city page as they land, with the newest vote, how many people voted, the days left, and a tally on each place. While the link is open, "Share" sends it again.
- A link closes after 7 days and is deleted a week later with its votes and names.
- The first vote on a link sends the sender one notification, at most once per link. Android files it under "Plan votes", and turning off "Save reminder notifications" in Profile → Settings stops it too.

## Pro / subscriptions (RevenueCat sandbox)

- Shelvr Pro gates saves past the 10 free ones, every photo save, Plan a date, Plan a trip, editing or removing a save's places, starting a shared list, and making a vote link. For free accounts, Go out opens the paywall from the tab bar or a city page, and Plan a trip opens it from the "Add spots" sheet or a city page. From the tab bar or the "Add spots" sheet, each needs a saved place pinned in a city first; without one, it shows "No places yet" instead of the paywall.
- Plans: **Annual** (labelled Yearly on the paywall; 7-day trial, then the yearly price) and **Weekly** (no trial). Both auto-renew until canceled.
- Lapsed subscribers are on the free plan: their existing saves stay open, and saves made while they had Pro do not count toward the 10.
- Present paywall from any gated action or Profile → View Pro plans.
- The paywall fills the screen, and the back arrow on its first screen closes it and returns to the screen that opened it. A signed-in account without Pro uses the app on the free plan and does not see the plan screen ("Pick a plan to open Shelvr"); that screen appears only if the free plan is turned off on the server.
- **Restore Purchases** is available in Profile → Settings and on the plan picker, the last paywall screen. Subscription management is available through Profile → Pro / View Pro plans.
- Verify sandbox products show localized price, trial, renewal text, Terms, Privacy, and Restore on the plan picker.
- Backend entitlement is Convex `subscriptions` updated by the RevenueCat webhook, so expect a brief delay after purchase. Pull to refresh or reopen Profile if needed.

## Previous App Review issues

- **Build 9, Guideline 2.1(a):** Sign in with Apple was unresponsive and Google sign-in ended in an error. Authentication now uses the production `shelvr://auth/callback` OAuth return path for both providers.
- **Build 13, Guideline 5.6.3:** onboarding asked for an App Store rating before the user experienced the product. The onboarding rating step was removed, and onboarding still has none. The system prompt is now eligible only after three successfully processed saves, when the user returns to the Map or Library from a save they opened.
- **Builds 14 and 16, Guideline 2.1(b):** Apple's sandbox purchase flow displayed RevenueCat Error 23. The rejected build 14 artifact contained a different RevenueCat public SDK key from the current App Store app. Production builds now fail before compilation unless EAS supplies an `appl_` App Store key and an HTTPS Convex URL. Before resubmission, inspect the new IPA and complete a clean sandbox purchase on iPhone, and on iPad in iPhone compatibility mode (`supportsTablet` is false, so there is no native iPad layout).

## Account deletion

- Profile → Settings → **Delete account**.
- Deleting an account that used Sign in with Apple also revokes its Apple token, when Shelvr holds one. An account that last signed in before Shelvr began keeping that token has none: its deletion still removes everything, the revocation is skipped, and signing in again once stores a token.
- Confirmation explains what is deleted (saves, places, identity) and that **App Store subscriptions are not cancelled** by account deletion. A user with an active subscription or trial also gets a **Manage subscription** button on that confirmation.
- Deletion also removes the places the user added to shared lists and takes them off every list, as if they had left it.
- After success the user is signed out.

## Legal and support

- Sign-in: tappable **Terms** and **Privacy Policy** (https://tryshelvr.app/terms, https://tryshelvr.app/privacy).
- Profile → Settings: Contact Support, Restore Purchases, Terms, and Privacy.
- Paywall fallback (only on SDK/network failure): Terms and Privacy links plus retry.

## Permissions

| Permission        | When requested                                                     | Why                                                                                  |
| ----------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| Calendar          | User adds an event from an item intent                             | Create calendar event from saved content                                             |
| Location          | The Map tab opens for the first time                               | Center the map on the user; Map works without it                                     |
| Notifications     | "Turn on reminders" in onboarding, or the trial reminder sheet     | Reminders about saved places, trips and the trial, and the first vote on a vote link |
| Photos (add only) | User picks Save Image in the share sheet of an image Shelvr shares | Save that image, such as a Passport story, to Photos                                 |

Shelvr does **not** record microphone audio and does not request microphone access in production.

## Privacy disclosures (summary)

- Account email via Apple/Google.
- Saved URLs, extracted page content and spoken words, and the places Gemini finds in them (AI runs automatically unless the account has a previously recorded opt-out).
- Photos and text the user saves, sent to Gemini unless the account has that opt-out.
- An optional trip cover photo, stored with the trip. It is not sent to AI and is not on a shared trip link.
- An unlisted trip link shows the trip's name, city, dates and scheduled stops with their times and notes, until the user revokes it.
- An unlisted Passport link shows the user's first name, their counts and the names of their stamped places by city, until the user stops sharing it.
- Place names sent to Apple Maps to pin a trip's stops (no live location tracking).
- Shared list members see the list's places and each other's first names.
- Voters on a vote link: their choices and an optional first name, seen only by the person who sent the link and deleted with the link.
- Cities the user marks as visited, from a fixed list of 25, stored with the account as Passport city stamps and shown only to that user.
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

Paste everything after this paragraph into App Review Information's notes. It began as the text submitted with 1.0.13 (build 53), whose first core review step named a Home heading that does not exist. Since then it has added the free plan (10 free saves, a closable onboarding paywall), the Map and Library screens, and what is new in 1.0.14. App Store Connect allows 4,000 characters, and `tools/onboarding-sync.test.mjs` fails when the text after this paragraph is longer.

New in 1.0.14: a free plan, the Map as first screen, Library, Passport and a new trip planner.

Shelvr is a private save-it-for-later app for Instagram Reels and TikToks. It uses AI to find the places a post names and file them under a city. It has no feed, messaging or public profiles. Users can share a save, trip, Passport or vote by unlisted link, or invite people to a shared list.

Account access:

1. Launch Shelvr and tap "Get started".
2. Answer "How many places have you saved?", "What would you like to plan?" and "Where have you been?" (tap answers, then "Continue", or "Skip"). Tap "Continue" under the chart, tap a city, then "Continue".
3. On the sample reel, follow the pills: Share, Share to…, More, then Shelvr. This demo is drawn inside the app; the reel becomes a real save after sign-in.
4. After the paywall (next section), choose Continue with Apple. Any Apple account works; no invitation or code is needed.

Subscription testing:

1. After the sample reel, tap "Continue" on the first-save screen, then on its spots and through the carousel. If a reminders screen appears, tap "Turn on reminders" or "Not now". The RevenueCat paywall (Apple sandbox) opens. Closing it skips buying: you sign in on the free plan (10 free saves; plans and photos need Pro).
2. The paywall has three screens: "Save the link. Shelvr does the filing.", "Get a heads-up before you pay", and "Pick a plan". Tap Continue, then See plans, then buy or start the trial with a sandbox account. Sign-in follows the purchase or restore.
3. Weekly and Annual (labelled Yearly) subscriptions auto-renew. Annual has a 7-day free trial for accounts that have not used one; Weekly has no trial.

Core review flow:

1. Tap the + button, then Paste a link, paste an Instagram Reel or TikTok link, and save. It shows as processing under Recents in Library, then its places appear on the Map and under their city. A link that names no place shows in Library's "Without a place" row, whose sheet offers Delete, and Retry when a retry can help.
2. Tap Library, Cities, then a city: a map and list of its places.
3. Tap "Go out", then "Plan a date" for two nearby stops. For a trip, tap "Plan a trip" in Go out, add a country, then "Start planning" and "Decide later". The cover photo is optional and uses the system picker. "Share trip" makes or revokes a view-only link.
4. The app opens on the Map, with search and filters. It asks for location on first open to center on you, and works without it.

Shared lists:

On a city page, tap "Invite", enter a name, then "Send invite". Anyone with the link can join (8 people at most); the list also works with one account. Members see its name, places and each other's first names. The owner can "Remove" a member, which also stops the old link. Anyone can "Leave list".

Share extension, Siri and widget:

1. Share a post from Safari, Instagram or TikTok, or a photo from Photos, to Shelvr. Shelvr opens and saves it. Photos need Pro.
2. In Shortcuts, open Shelvr and run "Save a Link" (also works through Siri) or "Save an Image".
3. The "Recent Saves" widget shows the latest saves.

Third-party AI:

To find places, Shelvr sends Google Gemini what it reads from a saved link (including captions and spoken words) and the photos and text users save. Planning does not send the saved collection or visit history to Gemini. Trip covers are never sent.

Account and support controls:

- Profile contains subscription management and Sign out. Profile > Settings contains Contact Support, Restore Purchases, Terms of Service, Privacy Policy, and Delete account.
- Delete account permanently removes the user's saves, places (shared list additions too), subscription record, and authentication identity. It does not cancel an App Store subscription, which remains managed by Apple.
