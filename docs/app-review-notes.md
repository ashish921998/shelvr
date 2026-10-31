# App Review notes for Shelvr

Use these notes in App Store Connect when submitting Shelvr for review.

## Account access

- Sign in with **Sign in with Apple** or **Google**.
- No password account is required.
- Reviewer path: onboarding opener → "How many places have you saved?" → "What would you like to plan?" → "How do you like to plan?" → a chart from scattered saves to a plan → "Pick a city to try." → a sample reel → its spots on a map → commitment → notifications → paywall (three screens, ending in the plan picker where you buy or start the trial in the sandbox) → **Continue with Apple** → Home. The notifications screen is skipped when iOS already has an answer. The paywall fills the screen; Close returns to the screen before it without granting app access. A purchase or restore leads to sign-in, and no account is created before then. Anyone whose paywall cannot load goes on to Home (then the app asks again once Home is up), and an account that already has Pro skips the paywall. Existing accounts can use **Already have an account? Sign in** on the opener.
- App Review can use its own Apple account through Sign in with Apple; no developer-issued credentials, one-time code, invitation, or special account state is required.
- A dedicated Google test account is optional fallback access. If one is supplied, enter the credentials in App Store Connect only, never in this repo or the app binary.
- Anonymous / "Continue without account" is **dev-only** and disabled in production builds.

## Onboarding

1. **Opener:** three pages that swipe sideways, each over a drawn phone, with headlines that open "Saved it.", "Your places," and "Make plans". The pages move on every few seconds until the user swipes, and stay put with Reduce Motion on. Under every page are a **Get started** button and an **Already have an account? Sign in** link.
2. **How many places have you saved?:** one answer of **Just a few**, **10 to 50**, **50 to 200**, **Hundreds** or **I've lost count**. **Continue** waits for an answer; **Skip** at the top right moves on without one.
3. **What would you like to plan?:** any of **Date nights**, **Trips** and **Places to eat**, or **A bit of everything** for all three. Each starts the shelf with one space (Date nights, Travel, Restaurants to try). **Continue** waits for at least one; **Skip** picks all three.
4. **How do you like to plan?:** one of **Planner**, **Flexible**, **Spontaneous** or **Explorer**. The answer is recorded in analytics and changes nothing else yet. **Skip** moves on.
5. **Chart:** the headline "Let’s put your saves to use.", and a curve that draws itself from "Lost in your saves" (Now) to "Date night planned", "Trip planned" or "Weekend planned". It is drawn already with Reduce Motion on. **Continue** moves on.
6. **Pick a city to try.** photo tiles of cities, plus "Not sure yet" (when only trips were picked) or "Somewhere else". One tap picks a city and moves on. The answer is retained; when that city has no sample reel, the demonstration uses Austin for the same goal instead.
7. **Sample reel:** "Try saving this reel." shows a real public Instagram reel labelled a sample, muted, credited to its creator. Austin, New York, Los Angeles, Chicago and San Francisco have reels for each goal; other city choices and a skipped city use Austin's reel for that goal. The app loads the reel's public embed page out of sight and plays its video in its own player, over the sample city's photo, which stays when the reel cannot load. The map and commitment use that reel's city and first three places. The video cannot be tapped. Everything after it is drawn inside the app (not the system share sheet), one tap per screen, with a pill naming the tap:
   - **Share** on the post opens a drawn Instagram share panel; **Share to…** opens a drawn iOS share sheet; **More** opens a drawn Apps list with **Shelvr** selectable immediately. Tapping it shows "Finding the spots…" for about a second and moves on. The demo has no pinning or Favorites-editing steps and does not change the real share sheet. Nothing is shared or saved and Shelvr's servers are not called; the only network use on this screen is the reel's video loading from Instagram.
   - **Spots:** a preview of the city page the save lands on. A full-width map, labelled "Added to" the city, drops a pin for each of the reel's first three places in video order. A sheet under it names the city with the count of places, credits the reel's creator, and lists the place names. **Continue** opens the commitment screen.
   - **Commitment:** "Visit a place you’ve saved." reuses the sample's city, map and three places. The promise names that city and uses the trip as its time frame for the trip goal, or this week for date nights and food, following the same leading goal as the sample. **Hold to commit** takes one second; releasing early cancels. **Tap to commit instead** offers the same action without holding. The same screen changes to "Promise made" and "You’re in." without advancing the progress bar. **Continue** then moves on; **Maybe later** moves on without making the promise. This is a personal intention, not a purchase or legal consent.
   - **Notifications:** "Don’t miss the places you saved." shows two sample reminders built from the same sample: the evening before a trip, and a saved place the user has not been to. **Turn on reminders** shows the iOS notification permission, and either answer opens the paywall. **Not now** opens the paywall without asking. The screen is skipped when iOS already has an answer, whichever it was. Reminders are optional: nothing in the app depends on them.
   - Both screens have a back button to the screen before.
   - The reel's link is kept on the device and saved to the account as its first save once the account has Pro, as if the user had shared it.
8. **Paywall:** the RevenueCat paywall, which has three screens. The opener, "Save the link. Shelvr does the filing.", shows a short carousel of what Shelvr does and has **Continue**. The trial explainer, "Get a heads-up before you pay", describes the 7-day trial on the Annual plan, which the paywall labels Yearly: Today, a reminder before the trial ends that is sent only if the user turns it on, and Day 7, when annual billing begins. It says to cancel at least 24 hours before the trial ends to avoid a charge, and where to cancel (Settings > your name > Subscriptions). **See plans** continues. The plan picker, "Pick a plan", offers **Yearly** (7-day trial, then the yearly price) and **Weekly** (no trial), each with its localized price. The buy button reads "Try for $0.00, then <price>/year" for Yearly with the trial (the zero is shown in the storefront's currency), and "Subscribe for <price>/week" for Weekly. The renewal line above the button, **Restore**, **Terms**, and **Privacy** are on this screen. These three screens are the offering for an account that can still start the trial, which includes a fresh sandbox account. An account that has already used its trial is shown a separate no-trial offering instead, which this note does not cover. The paywall fills the screen and has no close button. Its second and third screens can go back to the screen before. Anyone whose paywall cannot load goes on to Home (then the app asks again once Home is up), and an account that already has Pro skips the paywall. After a purchase or restore, Shelvr asks for Sign in with Apple or Google, attaches the purchase to the new account, and saves anything the user shared to Shelvr meanwhile. Once a trial has started, a sheet titled "Want a heads-up before you're charged?" offers the trial reminder when notifications are not on yet, and its **Remind me** button asks for the iOS notification permission.
9. **Home:** a one-time letter, "Plan less, go out more", with **Explore Shelvr** to close it. After onboarding, sign-in and Pro access, the demonstrated reel is saved through the normal link-reading flow. It appears under "Finding places…" during reading, then under its city when places are found.
10. Camera and Photo Library are **not** requested, during onboarding or after. This build has no camera or photo import.
11. Shelvr does **not** request an App Store rating during onboarding. The system rating prompt is eligible only after the user has at least three successfully processed saves, and only at the moment they return to Home from a save they opened. It never appears on launch or during an account's first session, and Shelvr requests it at most once.

## Core save loop

- **Link:** tap Add, paste an Instagram Reel or TikTok link (any page link is accepted), and save. Processing saves appear under "Finding places…". Once processing finishes, saves with a city appear as a city card on Home, under the Plan a date and Plan a trip tiles. If a save the user is watching fails or names no place, a banner says "Couldn't find places in that link" with **Retry** (or **View** when a retry can't help). Every failed or placeless save is counted in one line under the cities (for example, 2 saves without a place), whose **Review** opens a sheet with **Retry** and **Delete** for each. Notes, photos and the camera are not part of this build.
- **Share Sheet:** From Safari, Instagram or TikTok, share to Shelvr. While signed in, content saves automatically. While signed out, Shelvr preserves the intent and resumes after sign-in. During onboarding, a shared link is held on the device until sign-in. If the app is relaunched or interrupted mid-save, the pending marker and local session resume the flow on the next launch; successful completion or explicit abandonment clears them. If native payload cleanup fails, the completed session stays available for **Try again** or **Cancel**.

## Pro / subscriptions (RevenueCat sandbox)

- Shelvr Pro gates new saves, Plan a date and Plan a trip.
- Plans: **Annual** (labelled Yearly on the paywall; 7-day trial, then the yearly price) and **Weekly** (no trial). Both auto-renew until canceled.
- Lapsed subscribers keep **read-only** access to existing library content.
- Present paywall from any gated action or Profile → View Pro plans.
- The paywall fills the screen and has no close button. After onboarding, a signed-in account without Pro sees the plan screen ("Pick a plan to open Shelvr"), which keeps **Restore Purchases**, **Sign out**, **Settings** (where **Delete account** is), **Terms** and **Privacy** outside the paywall. **See plans** opens the paywall, which stays open until a purchase or restore.
- **Restore Purchases** is available in Profile → Settings and on the plan picker, the last paywall screen. Subscription management is available through Profile → Pro / View Pro plans.
- Verify sandbox products show localized price, trial, renewal text, Terms, Privacy, and Restore on the plan picker.
- Backend entitlement is Convex `subscriptions` updated by the RevenueCat webhook, so expect a brief delay after purchase. Pull to refresh or reopen Profile if needed.

## Previous App Review issues

- **Build 9, Guideline 2.1(a):** Sign in with Apple was unresponsive and Google sign-in ended in an error. Authentication now uses the production `shelvr://auth/callback` OAuth return path for both providers.
- **Build 13, Guideline 5.6.3:** onboarding asked for an App Store rating before the user experienced the product. The onboarding rating step was removed. The system prompt is now eligible only after three successfully processed saves, when the user returns to Home from a save they opened.
- **Builds 14 and 16, Guideline 2.1(b):** Apple's sandbox purchase flow displayed RevenueCat Error 23. The rejected build 14 artifact contained a different RevenueCat public SDK key from the current App Store app. Production builds now fail before compilation unless EAS supplies an `appl_` App Store key and an HTTPS Convex URL. Before resubmission, inspect the new IPA and complete a clean sandbox purchase on iPhone, and on iPad in iPhone compatibility mode (`supportsTablet` is false, so there is no native iPad layout).

## Account deletion

- Profile → Settings → **Delete account**.
- Deleting an account that used Sign in with Apple also revokes its Apple token, when Shelvr holds one. Shelvr started keeping that token with this release, so an account that last signed in before it has none: its deletion still removes everything, the revocation is skipped, and signing in again once stores a token.
- Confirmation explains what is deleted (saves, places, identity) and that **App Store subscriptions are not cancelled** by account deletion. A user with an active subscription or trial also gets a **Manage subscription** button on that confirmation.
- After success the user is signed out.

## Legal and support

- Sign-in: tappable **Terms** and **Privacy Policy** (https://shelvr-web.vercel.app/terms, https://shelvr-web.vercel.app/privacy).
- Profile → Settings: Contact Support, Restore Purchases, Terms, and Privacy.
- Paywall fallback (only on SDK/network failure): Terms and Privacy links plus retry.

## Permissions

| Permission | When requested                         | Why                                      |
| ---------- | -------------------------------------- | ---------------------------------------- |
| Calendar   | User adds an event from an item intent | Create calendar event from saved content |

Shelvr does **not** record microphone audio and does not request microphone access in production.

## Privacy disclosures (summary)

- Account email via Apple/Google.
- Saved URLs, extracted page content and spoken words, and the places Gemini finds in them (AI runs automatically unless the account has a previously recorded opt-out).
- Place names sent to Apple Maps to pin a trip's stops (no live location tracking).
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

Shelvr is a private save-it-for-later app for Instagram Reels and TikToks. It uses AI to find the places a post names and file them under a city. It has no feed and no messaging. A user can share one save through an unlisted link, which goes away when the save is deleted or the share sheet is cancelled.

Account access:

1. Launch Shelvr and tap "Get started". If you already have an account, tap "Already have an account? Sign in" instead.
2. Answer "How many places have you saved?", "What would you like to plan?" and "How do you like to plan?" (tap an answer, then "Continue", or "Skip"), tap "Continue" under the chart, then tap a city on "Pick a city to try.".
3. On the sample reel, follow the pills: Share, Share to…, More, then Shelvr. This is a demonstration drawn inside the app; the reel becomes a real save after onboarding, sign-in and Pro access.
4. After the purchase in the next section, Shelvr asks you to sign in: choose Continue with Apple. App Review may use its own Apple account; no invitation, one-time code, or preconfigured account state is required. Sign in completes through Apple's system authentication flow.

Subscription testing:

1. After the sample reel, tap "Continue" on the spots it found to reach the commitment screen. Make the optional promise and tap "Continue", or choose "Maybe later". On the notifications screen, tap "Turn on reminders" or "Not now" to open the RevenueCat paywall in Apple's sandbox environment. Close returns to the screen before it; it does not unlock app access. Continue to the plan picker to buy or start the trial. Sign-in follows the purchase or restore.
2. The paywall has three screens: an intro ("Save the link. Shelvr does the filing."), a trial explainer ("Get a heads-up before you pay"), and the plan picker ("Pick a plan"). Tap Continue, then See plans. Buy a plan or start the trial with a sandbox account on the plan picker.
3. Weekly and Annual auto-renewing subscriptions are available; the paywall labels Annual as Yearly. The Annual plan includes a 7-day free trial for accounts that have not used it before; the Weekly plan has no trial.
4. Localized price, duration, renewal terms, Restore Purchases, Terms, and Privacy are shown on the plan picker.
5. Restore Purchases is also available from Profile > Settings.
6. If subscription status takes a moment to refresh after purchase or restore, reopen Profile.

Core review flow:

1. From Home, tap Add, paste an Instagram Reel or TikTok link, and save. The save first shows processing, then the places it names appear on a city card on Home. A link that names no place shows a "Couldn't find places in that link" banner and is counted under the cities, with **Review**.
2. Tap a city to open its page: a map with a pin per place, and a sheet listing the places.
3. On the city page, tap "Plan a date" or "Plan a trip" to get a shortlist or a day-by-day trip selected within Shelvr from places already saved in that city. Places marked "We went" are excluded; planning does not send the saved collection or visit history to Gemini. Apple Maps locates trip stops.
4. Tap a save to see its detail; the source link opens the original post.
5. Shelvr does not request camera or photo access, and does not request or track live device location.

Share extension, Siri and widget:

1. In Safari or the Instagram or TikTok app, open a post, tap Share, and choose Shelvr. The link is saved without leaving Safari.
2. In the Shortcuts app, open Shelvr and run "Save a Link". The same action works through Siri.
3. Add the "Recent Saves" widget to the Home Screen to see the latest saves.

Third-party AI:

To find the places in a saved reel or TikTok, Shelvr sends its caption and spoken words to Google Gemini. Date and trip planning happens within Shelvr using places already saved in the selected city and excluding places marked "We went". The saved collection and visit history are not sent to Gemini for planning; Apple Maps still resolves trip stops. Home opens after onboarding and its paywall without an AI permission prompt or Settings switch. Accounts without a recorded preference use AI automatically for incoming saves; previously recorded opt-outs remain honored. Plans can still use previously saved places when AI processing is disabled.

Account and support controls:

- Profile contains subscription management and Sign out. Profile > Settings contains Contact Support, Restore Purchases, Terms of Service, Privacy Policy, and Delete account.
- To delete an account: Profile > Settings > Delete account.
- Delete account permanently removes the user's saves, places, subscription record, and authentication identity. It does not cancel an App Store subscription, which remains managed by Apple.

Internet access is required for sign-in, subscriptions, cloud sync, and AI organization. Shelvr does not request an App Store rating during onboarding. It may ask once, after at least three saves, when the user returns to Home from a save they opened.
