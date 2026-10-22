# App Review notes for Shelvr

Use these notes in App Store Connect when submitting Shelvr for review.

## Account access

- Sign in with **Sign in with Apple** or **Google**.
- No password account is required.
- Reviewer path: onboarding opener → "What do you save?" → city (for Travel ideas, Food places or Date-night spots) or topics (for Something else) → share practice → sample plan (not for Something else) → promise → paywall (three screens, ending in the plan picker where you buy or start the trial in the sandbox) → **Continue with Apple** → Home. A signed-out user who dismisses the paywall without a purchase or restore stays on the step that opened it, and no account is created. Someone already signed in goes on to Home, as does anyone whose paywall cannot load (then the app asks again once Home is up), and an account that already has Pro skips the paywall. Existing accounts can use **Already have an account? Sign in** on the opener.
- App Review can use its own Apple account through Sign in with Apple; no developer-issued credentials, one-time code, invitation, or special account state is required.
- A dedicated Google test account is optional fallback access. If one is supplied, enter the credentials in App Store Connect only, never in this repo or the app binary.
- Anonymous / "Continue without account" is **dev-only** and disabled in production builds.

## Onboarding

1. **Opener:** a **Start yours** button and an **Already have an account? Sign in** link.
2. **What do you save?:** one question with four answers: **Travel ideas**, **Food places**, **Date-night spots** and **Something else**. One tap picks an answer and moves on. Each of the first three starts the shelf with one space (Travel, Restaurants to try, or Date nights).
   - **City (Travel ideas, Food places, Date-night spots):** "Where are you going next?", "Where do you eat out?" or "Where's date night?" lists the cities the sample is written for (eleven for travel, four for food and date night) plus "Not sure yet" or "Somewhere else", which use Prague. One tap picks a city and moves on.
   - **Topics (Something else):** "What are you into?" offers topics to pick. Each picked topic becomes a space, and **Continue** waits for at least one.
3. **Share practice:** "Save a place for your trip.", "Save a spot to eat.", "Save a date-night spot." or, for Something else, "Save your first post." has the user share one sample post to Shelvr through the system share sheet, with the **Share this post** button or the Share icon on the post, or skip with **I'll try it later**. The post is a page about a place in the sample the user sees next, or about the first picked topic. No account is needed: the shared link is held on the device and saved to the account after sign-in. A successful share shows "You nailed it." and a **Continue** button. Onboarding does not ask for notifications.
4. **Sample plan (not for Something else):** a short screen builds a fixed sample from three sample saves in the picked city, then shows it in full on a map: a two-day trip for Travel ideas, one evening (dinner, drinks, dessert, a walk) for Date-night spots, and a Saturday and Sunday of places to eat for Food places. Every screen labels it a sample; it is not made from the user's saves and calls no server. **Continue** moves on to the promise.
5. **Promise:** "Last thing. Make it count." lists two habits the user promises themselves; the second names the answer to "What do you save?". The promise itself is not saved; as on every onboarding step, the app only remembers the step on the device and records that it was shown and completed in analytics. **I'm in** is the only action and opens the paywall.
6. **Paywall:** **I'm in** opens the RevenueCat paywall, which has three screens. The opener, "Save the link. Shelvr does the filing.", shows a short carousel of what Shelvr does and has **Continue**. The trial explainer, "Get a heads-up before you pay", describes the 7-day trial on the Annual plan, which the paywall labels Yearly: Today, a Day 5 reminder that is sent only if the user turns it on, and Day 7, when annual billing begins. It says to cancel at least 24 hours before the trial ends to avoid a charge, and where to cancel (Settings > your name > Subscriptions). **See plans** continues. The plan picker, "Pick a plan", offers **Yearly** (7-day trial, then the yearly price) and **Weekly** (no trial), each with its localized price. The buy button reads "Try for $0.00, then <price>/year" for Yearly with the trial (the zero is shown in the storefront's currency), and "Subscribe for <price>/week" for Weekly. The renewal line above the button, **Restore**, **Terms**, and **Privacy** are on this screen. These three screens are the offering for an account that can still start the trial, which includes a fresh sandbox account. An account that has already used its trial is shown a separate no-trial offering instead, which this note does not cover. A signed-out user who dismisses the paywall without a purchase or restore stays on the step that opened it. Someone already signed in goes on to Home, as does anyone whose paywall cannot load (then the app asks again once Home is up), and an account that already has Pro skips the paywall. After a purchase or restore, Shelvr asks for Sign in with Apple or Google, attaches the purchase to the new account, and saves the shared post.
7. **Home:** a card teaches saving from the share sheet. After the first share-sheet save, Home asks once whether to turn on the weekly shelf notification.
8. Camera and Photo Library are **not** requested during onboarding. They are requested only when the reviewer opens Camera or imports/Tidy photos.
9. Shelvr does **not** request an App Store rating during onboarding. The system rating prompt is eligible only after the user has at least three successfully processed saves, and only at the moment they return to Home from a save they opened. It never appears on launch or during an account's first session, and Shelvr requests it at most once.

## Core save loop

- **Link:** tap Add, paste a URL, and save. The item enters processing, then ready with title/description/tags when AI completes.
- **Note:** tap Add, type a note, and save. The content remains if AI classification fails.
- **Image:** Camera capture or library import. Upload progress and retry are shown on failure.
- **Share Sheet:** From Safari or Photos, share to Shelvr. While signed in, content saves automatically. While signed out, Shelvr preserves the intent and resumes after sign-in. During onboarding, a shared link is held on the device until sign-in. If the app is relaunched or interrupted mid-save, the pending marker and local session resume the flow on the next launch; successful completion or explicit abandonment clears them. If native payload cleanup fails, the completed session stays available for **Try again** or **Cancel**.

## Pro / subscriptions (RevenueCat sandbox)

- Shelvr Pro gates new saves, Tidy, Map, dynamic Spaces, and Find links.
- Plans: **Annual** (labelled Yearly on the paywall; 7-day trial, then the yearly price) and **Weekly** (no trial). Both auto-renew until canceled.
- Lapsed subscribers keep **read-only** access to existing library content.
- Present paywall from any gated action or Profile → View Pro plans.
- If the paywall is dismissed without a purchase or restore, the app returns to the previous screen (not an error).
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
| Photo Library | User imports a photo or opens Tidy     | Import / tidy photos                     |
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

1. Launch Shelvr and tap "Start yours". If you already have an account, tap "Already have an account? Sign in" instead.
2. On "What do you save?", tap one answer. For Travel ideas, Food places or Date-night spots, tap a city next; for Something else, pick at least one topic on "What are you into?" and tap Continue.
3. On the share practice screen (for example "Save a date-night spot."), tap "Share this post" and pick Shelvr in the share sheet, or tap "I'll try it later". A shared post is kept on the device until the account exists.
4. After the purchase in the next section, Shelvr asks you to sign in: choose Continue with Apple. App Review may use its own Apple account; no invitation, one-time code, or preconfigured account state is required. Sign in completes through Apple's system authentication flow.

Subscription testing:

1. After the share practice (tap "Continue", or "I'll try it later" to skip it), a sample plan builds and shows in full unless you answered Something else; tap "Continue" on it. Then tap "I'm in" on "Last thing. Make it count." to open the RevenueCat paywall in Apple's sandbox environment. If you dismiss the paywall without a purchase or restore while signed out, Shelvr stays on the step that opened it. A user who is already signed in goes on to Home instead. Sign-in follows the purchase or restore.
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
5. Camera permission is requested only after choosing Camera. Photo Library access is requested only after importing a photo or opening Tidy.
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
