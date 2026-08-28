# App Review Notes — Shelvr

Use these notes in App Store Connect when submitting Shelvr for review.

## Account access

- Sign in with **Sign in with Apple** or **Google**.
- No password account is required.
- Reviewer path: complete onboarding → sign in with Apple → Home.
- App Review can use its own Apple account through Sign in with Apple; no developer-issued credentials, one-time code, invitation, or special account state is required.
- A dedicated Google test account is optional fallback access. If one is supplied, enter the credentials in App Store Connect only—never in this repo or the app binary.
- Anonymous / “Continue without account” is **dev-only** and disabled in production builds.

## Onboarding

1. Promise screen → survey (optional multi-select) → space picker → short building animation → optional live demo save → permissions explanation (no system prompts yet) → Ready.
2. Camera and Photo Library are **not** requested during onboarding. They are requested only when the reviewer opens Camera or imports/Tidy photos.
3. Shelvr does **not** request an App Store rating during onboarding. The system rating prompt is eligible only after the user has accumulated at least three successfully processed saves, and it is requested at most once by Shelvr.

## Core save loop

- **Link:** Add → paste URL → save. Item enters processing, then ready with title/description/tags when AI completes.
- **Note:** Add → type note → save. Content remains if AI classification fails.
- **Image:** Camera capture or library import. Upload progress and retry are shown on failure.
- **Share Sheet:** From Safari or Photos, share to Shelvr. While signed in, content saves automatically. While signed out or mid-onboarding, Shelvr preserves the intent and resumes after auth. If the app is relaunched or interrupted mid-save, the pending marker and local session resume the flow on the next launch; successful completion or explicit abandonment clears them. If native payload cleanup fails, the completed session stays available for **Try again** or **Cancel**.

## Pro / subscriptions (RevenueCat sandbox)

- Shelvr Pro gates new saves, Tidy, Map, dynamic Spaces, and Find links.
- Lapsed subscribers keep **read-only** access to existing library content.
- Present paywall from any gated action or Profile → View Pro plans.
- **Cancellation** of the paywall returns to the previous screen (not an error).
- **Restore Purchases** is available directly in Profile and on the RevenueCat paywall. Subscription management is available through Profile → Pro / View Pro plans.
- Verify sandbox products show localized price, trial, renewal text, Terms, Privacy, and Restore.
- Backend entitlement is Convex `subscriptions` updated by the RevenueCat webhook; brief delay after purchase is expected — pull to refresh / reopen Profile if needed.

## Previous App Review issues

- **Build 9 — Guideline 2.1(a):** Sign in with Apple was unresponsive and Google sign-in ended in an error. Authentication now uses the production `shelvr://auth/callback` OAuth return path for both providers.
- **Build 13 — Guideline 5.6.3:** onboarding asked for an App Store rating before the user experienced the product. The onboarding rating step was removed. The system prompt is now eligible only after three successfully processed saves.
- **Builds 14 and 16 — Guideline 2.1(b):** Apple's sandbox purchase flow displayed RevenueCat Error 23. The rejected build 14 artifact contained a different RevenueCat public SDK key from the current App Store app. Production builds now fail before compilation unless EAS supplies an `appl_` App Store key and an HTTPS Convex URL. Before resubmission, inspect the new IPA and complete a clean sandbox purchase on iPhone and iPad.

## Account deletion

- Profile → **Delete account**.
- Confirmation explains what is deleted (saves, spaces, uploads, identity) and that **App Store subscriptions are not cancelled** by account deletion.
- After success the user is signed out.

## Legal and support

- Sign-in: tappable **Terms** and **Privacy Policy** (https://shelvr-web.vercel.app/terms, https://shelvr-web.vercel.app/privacy).
- Profile: Contact Support, Restore Purchases, Terms, and Privacy.
- Paywall fallback (only on SDK/network failure): Terms and Privacy links plus retry.

## Permissions

| Permission | When requested | Why |
|---|---|---|
| Camera | User opens Camera to capture | Save a photo into Shelvr |
| Photo Library | User imports a photo or opens Tidy | Import / tidy photos |
| Calendar | User adds an event from an item intent | Create calendar event from saved content |

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

- Run `pnpm --filter native-app check` and test the signed production build on a physical iPhone.
- Confirm `EXPO_PUBLIC_CONVEX_URL` and `EXPO_PUBLIC_REVENUECAT_IOS_KEY` exist in the EAS production environment.
- Confirm the production Convex deployment has working Apple/Google OAuth, AI, and RevenueCat webhook configuration.
- Confirm the Monthly and Annual subscriptions are attached to the submission, available in every intended territory, and render localized prices and renewal periods in the paywall.
- Confirm the Annual 7-day trial offer is available in every intended storefront. Generic app actions use **View Pro plans** because the Monthly plan does not include a trial.
- Confirm App Privacy is published and matches `apps/native/privacy.json`, `ios.privacyManifests`, and the hosted Privacy Policy.
- Add complete contact information and the notes below to App Review Information.
- Attach `apps/native/store-assets/preview/shelvr-preview-6.9.mp4` as the review demo if it reflects the submitted build; otherwise record a fresh walkthrough of sign-in, onboarding, paywall, save, restore, permissions, and account deletion.
- Remove every unresolved review issue or mark it resolved before resubmitting.

## Paste-ready App Review notes

Shelvr is a private save-it-for-later app for links, notes, and images. It uses AI to generate titles, descriptions, tags, and private Spaces. It has no public feed, messaging, or user-generated content shared between users.

Account access:
1. Launch Shelvr and complete the optional onboarding questions.
2. Choose Continue with Apple. App Review may use its own Apple account; no invitation, one-time code, or preconfigured account state is required.
3. Sign in completes through Apple's system authentication flow.

Subscription testing:
1. After onboarding and sign-in, Shelvr presents the RevenueCat paywall using Apple's sandbox environment.
2. Monthly and Annual auto-renewing subscriptions are available. The Annual plan includes a 7-day free trial.
3. Localized price, duration, renewal terms, Restore Purchases, Terms, and Privacy are shown on the paywall.
4. Restore Purchases is also available from Profile.
5. If subscription status takes a moment to refresh after purchase or restore, close the paywall and reopen Profile.

Core review flow:
1. From Home, tap Add.
2. Save a URL or note. The item first shows processing, then receives an AI-generated title, description, tags, and Space suggestions.
3. Open Search to find the saved item.
4. Open Spaces to create or inspect a collection.
5. Camera permission is requested only after choosing Camera. Photo Library access is requested only after importing a photo or opening Tidy.
6. The Map uses only GPS metadata embedded in photos the user selects; Shelvr does not request or track live device location.

Account and support controls:
- Profile contains Contact Support, Restore Purchases, subscription management, Terms of Service, Privacy Policy, Sign out, and Delete account.
- Delete account permanently removes the user's saves, spaces, uploads, subscription record, and authentication identity. It does not cancel an App Store subscription, which remains managed by Apple.

Internet access is required for sign-in, subscriptions, cloud sync, and AI organization. Shelvr does not request an App Store rating during onboarding.
