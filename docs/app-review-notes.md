# App Review notes for Shelvr

Use these notes in App Store Connect when submitting Shelvr for review.

## Account access

- Sign in with **Sign in with Apple** or **Google**.
- No password account is required.
- Reviewer path: onboarding opener → "How many spots have you saved already?" → "What do you want to plan?" → "How do you like to plan?" → "Pick a city to try it with" → a sample reel → its spots on a map → a sample plan → trial reminder → paywall (three screens, ending in the plan picker where you buy or start the trial in the sandbox) → **Continue with Apple** → Home. The paywall fills the screen and has no close button, so it ends with a purchase or a restore, and no account is created before then. Anyone whose paywall cannot load goes on to Home (then the app asks again once Home is up), and an account that already has Pro skips the paywall. Existing accounts can use **Already have an account? Sign in** on the opener.
- App Review can use its own Apple account through Sign in with Apple; no developer-issued credentials, one-time code, invitation, or special account state is required.
- A dedicated Google test account is optional fallback access. If one is supplied, enter the credentials in App Store Connect only, never in this repo or the app binary.
- Anonymous / "Continue without account" is **dev-only** and disabled in production builds.

## Onboarding

1. **Opener:** a collage of city photos, the line "Save the spots. We'll plan the date or the trip.", a **Get started** button and an **Already have an account? Sign in** link.
2. **How many spots have you saved already?:** one answer of **Just a few**, **10 to 50**, **50 to 200**, **Hundreds** or **I've lost count**. **Continue** waits for an answer; **Skip** at the top right moves on without one.
3. **What do you want to plan?:** any of **Date nights**, **Trips** and **Places to eat**, or **A bit of everything** for all three. Each starts the shelf with one space (Date nights, Travel, Restaurants to try). **Continue** waits for at least one; **Skip** picks all three.
4. **How do you like to plan?:** one of **Planner**, **Flexible**, **Spontaneous** or **Explorer**. The answer is recorded in analytics and changes nothing else yet. **Skip** moves on.
5. **Pick a city to try it with:** photo tiles of the cities the sample is written for, plus "Not sure yet" (when only trips were picked) or "Somewhere else", which use Prague. One tap picks a city and moves on.
6. **Sample reel:** "Try it: save this reel to Shelvr" shows a made-up post, labelled a sample, from a made-up account, with a share sheet drawn inside the app (not the system one) offering Messages, Shelvr and Copy link. Tapping **Shelvr** moves on; nothing is shared or saved and no server is called.
   - **Found 3 spots in that reel:** a map drops a pin for each of three places in the sample, each with a line the made-up creator wrote about it. **Continue** moves on.
   - **Sample plan:** the same three places as one evening (date nights), one day (trips) or one food day (places to eat), with times and walking minutes, and a note tying it to the first answer. It is a fixed sample, not made from the user's saves. **Save your own spots** moves on.
   - Back is not offered from these three screens.
   - **Trial reminder:** "We'll remind you before it ends" shows a mock notification and asks how many days before the trial ends to remind the user (1, 2 or 3; 2 is picked). **Continue** asks for the iOS notification permission and keeps the choice for the trial reminder; **Not now** moves on without it. The screen is skipped when notifications were already allowed or refused. Either button opens the paywall.
7. **Paywall:** the RevenueCat paywall, which has three screens. The opener, "Save the link. Shelvr does the filing.", shows a short carousel of what Shelvr does and has **Continue**. The trial explainer, "Get a heads-up before you pay", describes the 7-day trial on the Annual plan, which the paywall labels Yearly: Today, a reminder before the trial ends that is sent only if the user turns it on, and Day 7, when annual billing begins. It says to cancel at least 24 hours before the trial ends to avoid a charge, and where to cancel (Settings > your name > Subscriptions). **See plans** continues. The plan picker, "Pick a plan", offers **Yearly** (7-day trial, then the yearly price) and **Weekly** (no trial), each with its localized price. The buy button reads "Try for $0.00, then <price>/year" for Yearly with the trial (the zero is shown in the storefront's currency), and "Subscribe for <price>/week" for Weekly. The renewal line above the button, **Restore**, **Terms**, and **Privacy** are on this screen. These three screens are the offering for an account that can still start the trial, which includes a fresh sandbox account. An account that has already used its trial is shown a separate no-trial offering instead, which this note does not cover. The paywall fills the screen and has no close button. Its second and third screens can go back to the screen before. Anyone whose paywall cannot load goes on to Home (then the app asks again once Home is up), and an account that already has Pro skips the paywall. After a purchase or restore, Shelvr asks for Sign in with Apple or Google, attaches the purchase to the new account, and saves anything the user shared to Shelvr meanwhile.
8. **Home:** a one-time letter, "Plan less, go out more", with **Explore Shelvr** to close it, then a "Get set up" card that ticks off **Share a TikTok**, **Add an Instagram reel or a screenshot** and **Paste a list** from the user's saves. After the first share-sheet save, Home asks once whether to turn on the weekly shelf notification.
9. Camera and Photo Library are **not** requested during onboarding. They are requested only when the reviewer opens Camera or imports a photo.
10. Shelvr does **not** request an App Store rating during onboarding. The system rating prompt is eligible only after the user has at least three successfully processed saves, and only at the moment they return to Home from a save they opened. It never appears on launch or during an account's first session, and Shelvr requests it at most once.

## Core save loop

- **Link:** tap Add, paste a URL, and save. The item enters processing, then ready with title/description/tags when AI completes.
- **Note:** tap Add, type a note, and save. The content remains if AI classification fails.
- **Image:** Camera capture or library import. Upload progress and retry are shown on failure.
- **Share Sheet:** From Safari or Photos, share to Shelvr. While signed in, content saves automatically. While signed out, Shelvr preserves the intent and resumes after sign-in. During onboarding, a shared link is held on the device until sign-in. If the app is relaunched or interrupted mid-save, the pending marker and local session resume the flow on the next launch; successful completion or explicit abandonment clears them. If native payload cleanup fails, the completed session stays available for **Try again** or **Cancel**.

## Pro / subscriptions (RevenueCat sandbox)

- Shelvr Pro gates new saves, Map, dynamic Spaces, and Find links.
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
- Confirmation explains what is deleted (saves, spaces, uploads, identity) and that **App Store subscriptions are not cancelled** by account deletion. A user with an active subscription or trial also gets a **Manage subscription** button on that confirmation.
- After success the user is signed out.

## Legal and support

- Sign-in: tappable **Terms** and **Privacy Policy** (https://shelvr-web.vercel.app/terms, https://shelvr-web.vercel.app/privacy).
- Profile → Settings: Contact Support, Restore Purchases, Terms, and Privacy.
- Paywall fallback (only on SDK/network failure): Terms and Privacy links plus retry.

## Permissions

| Permission    | When requested                         | Why                                      |
| ------------- | -------------------------------------- | ---------------------------------------- |
| Camera        | User opens Camera to capture           | Save a photo into Shelvr                 |
| Photo Library | User imports a photo                   | Import photos                            |
| Calendar      | User adds an event from an item intent | Create calendar event from saved content |

Shelvr does **not** record microphone audio and does not request microphone access in production.

## Privacy disclosures (summary)

- Account email via Apple/Google.
- Saved URLs, notes, images, extracted page content, AI titles/tags/classifications.
- EXIF capture time / GPS from imported photos only (no live location tracking).
- Product-search queries when user taps Find links.
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
- Attach the preview video from `shelvr-notes/store-assets/preview/` as the review demo if it reflects the submitted build; otherwise record a fresh walkthrough of sign-in, onboarding, paywall, save, restore, permissions, and account deletion.
- Remove every unresolved review issue or mark it resolved before resubmitting.

## Paste-ready App Review notes

Shelvr is a private save-it-for-later app for links, notes, and images. It uses AI to generate titles, descriptions, tags, and private Spaces. It has no feed and no messaging. A user can share one save through an unlisted link, which goes away when the save is deleted or the share sheet is cancelled.

Account access:

1. Launch Shelvr and tap "Get started". If you already have an account, tap "Already have an account? Sign in" instead.
2. Answer "How many spots have you saved already?", "What do you want to plan?" and "How do you like to plan?" (tap an answer, then "Continue", or "Skip"), then tap a city on "Pick a city to try it with".
3. On the sample reel, tap Shelvr in the share sheet drawn below it. This is a demonstration inside the app: nothing is shared or saved.
4. After the purchase in the next section, Shelvr asks you to sign in: choose Continue with Apple. App Review may use its own Apple account; no invitation, one-time code, or preconfigured account state is required. Sign in completes through Apple's system authentication flow.

Subscription testing:

1. After the sample reel, tap "Continue" on the spots it found and "Save your own spots" on the sample plan. Then tap "Continue" or "Not now" on the trial reminder screen (it is skipped when notifications were already allowed or refused) to open the RevenueCat paywall in Apple's sandbox environment. The paywall fills the screen and has no close button, so continue to the plan picker and buy or start the trial there. Sign-in follows the purchase or restore.
2. The paywall has three screens: an intro ("Save the link. Shelvr does the filing."), a trial explainer ("Get a heads-up before you pay"), and the plan picker ("Pick a plan"). Tap Continue, then See plans. Buy a plan or start the trial with a sandbox account on the plan picker.
3. Weekly and Annual auto-renewing subscriptions are available; the paywall labels Annual as Yearly. The Annual plan includes a 7-day free trial for accounts that have not used it before; the Weekly plan has no trial.
4. Localized price, duration, renewal terms, Restore Purchases, Terms, and Privacy are shown on the plan picker.
5. Restore Purchases is also available from Profile > Settings.
6. If subscription status takes a moment to refresh after purchase or restore, reopen Profile.

Core review flow:

1. From Home, tap Add.
2. Save a URL or note. The item first shows processing, then receives an AI-generated title, description, tags, and Space suggestions.
3. Open Search to find the saved item.
4. Open Spaces to create or inspect a collection.
5. Camera permission is requested only after choosing Camera. Photo Library access is requested only after importing a photo.
6. The Map uses only GPS metadata embedded in photos the user selects; Shelvr does not request or track live device location.

Share extension, Siri and widget:

1. In Safari, open any page, tap Share, and choose Shelvr. The link is saved without leaving Safari.
2. In the Shortcuts app, open Shelvr and run "Save a Link". The same action works through Siri.
3. Add the "Recent Saves" widget to the Home Screen to see the latest saves.

Third-party AI:

Saves are sent to Google Gemini to generate titles, summaries, and tags. The sign-in screen says so and that continuing allows it, so permission is given before the first save. People who were already signed in when this shipped are asked once on launch instead. Settings has a switch, "AI titles, tags and suggestions", to turn it off.

Account and support controls:

- Profile contains subscription management and Sign out. Profile > Settings contains Contact Support, Restore Purchases, Terms of Service, Privacy Policy, and Delete account.
- To delete an account: Profile > Settings > Delete account.
- Delete account permanently removes the user's saves, spaces, uploads, subscription record, and authentication identity. It does not cancel an App Store subscription, which remains managed by Apple.

Internet access is required for sign-in, subscriptions, cloud sync, and AI organization. Shelvr does not request an App Store rating during onboarding. It may ask once, after at least three saves, when the user returns to Home from a save they opened.
