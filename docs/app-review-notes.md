# App Review Notes — Shelvr

Use these notes in App Store Connect when submitting Shelvr for review.

## Account access

- Sign in with **Sign in with Apple** or **Google**.
- No password account is required.
- Reviewer path: complete onboarding → sign in with Apple → Home.
- Provide a dedicated demo Google account in App Store Connect → App Review Information (sign-in required apps must not rely on the reviewer's personal Apple ID / Google account). Enter the credentials in App Store Connect only — never in this repo or the app binary.
- Anonymous / “Continue without account” is **dev-only** and disabled in production builds.

## Onboarding

1. Promise screen → survey (optional multi-select) → space picker → short building animation → optional live demo save → permissions explanation (no system prompts yet) → optional review prompt → Ready.
2. Camera and Photo Library are **not** requested during onboarding. They are requested only when the reviewer opens Camera or imports/Tidy photos.
3. The review step uses neutral copy (“Leave a review” / “Not now”) and the system StoreKit review API. It may no-op under Apple rate limits.

## Core save loop

- **Link:** Add → paste URL → save. Item enters processing, then ready with title/description/tags when AI completes.
- **Note:** Add → type note → save. Content remains if AI classification fails.
- **Image:** Camera capture or library import. Upload progress and retry are shown on failure.
- **Share Sheet:** From Safari or Photos, share to Shelvr. While signed in, content saves automatically. While signed out or mid-onboarding, Shelvr preserves the intent and resumes after auth.

## Pro / subscriptions (RevenueCat sandbox)

- Shelvr Pro gates new saves, Tidy, Map, dynamic Spaces, and Find links.
- Lapsed subscribers keep **read-only** access to existing library content.
- Present paywall from any gated action or Profile → Start free trial.
- **Cancellation** of the paywall returns to the previous screen (not an error).
- **Restore Purchases** is on the RevenueCat paywall and via Profile → manage subscription (Customer Center / App Store subscriptions).
- Verify sandbox products show localized price, trial, renewal text, Terms, Privacy, and Restore.
- Backend entitlement is Convex `subscriptions` updated by the RevenueCat webhook; brief delay after purchase is expected — pull to refresh / reopen Profile if needed.

## Account deletion

- Profile → **Delete account**.
- Confirmation explains what is deleted (saves, spaces, uploads, identity) and that **App Store subscriptions are not cancelled** by account deletion.
- After success the user is signed out.

## Legal and support

- Sign-in: tappable **Terms** and **Privacy Policy** (https://shelvr.app/terms, https://shelvr.app/privacy).
- Profile: Terms, Privacy, Contact support (`support@shelvr.app`).
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
