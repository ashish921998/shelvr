# App Review audit — August 24, 2026

## Submission history

| Submitted | Submission | Result | Apple finding |
|---|---|---|---|
| Aug 8 | `cd58b8da-00d3-410c-ac0c-aae15549d1d9` | Removed | Withdrawn before review; no Apple message. |
| Aug 8 | `3fa28ceb-0f5e-4a35-af9f-c7642a2c429c` | Rejected, then removed | Build 9: Guideline 2.1(a). Sign in with Apple was unresponsive; Google sign-in ended in an error. |
| Aug 13 | `905f85d4-dc42-4c6f-bef8-65be1084b7c7` | Removed | Withdrawn before review; no Apple message. |
| Aug 13 | `f1c43730-2b98-4acd-88e4-0d2c29447f20` | Rejected, then removed | Build 13: Guideline 5.6.3. The app requested a rating during onboarding. |
| Aug 18 | `3f8657b2-4243-4402-b1a7-f1f7eaf00033` | Unresolved issues | Builds 14 and 16: Guideline 2.1(b). Apple's sandbox purchase displayed RevenueCat Error 23 (configuration error) on iPhone and iPad. |

## Verified repairs

- Apple and Google authentication buttons open the OAuth authentication session on clean iPhone and iPad simulators.
- The onboarding rating step is removed; the system rating prompt is eligible only after three successfully processed saves.
- Weekly, Monthly, and Annual subscriptions are attached to the current review submission and pass App Store Connect validation.
- The Paid Apps Agreement, banking, tax, and compliance records are active.
- The RevenueCat App Store app uses bundle ID `app.shelvr.save`, a valid In-App Purchase key, one active offering, three packages, and one attached entitlement.
- Production EAS builds now fail if the iOS RevenueCat key is not an `appl_` key or Convex is not HTTPS.
- Signed IPA inspection verifies the production RevenueCat public key, legal URLs, privacy manifest, bundle ID, and build number before upload.
- Production removes Expo Dev Client's Bonjour and local-network permission metadata; development builds retain it.
- Generic app actions say **View Pro plans**, because only Annual includes a three-day trial.
- Profile contains Contact Support, Restore Purchases, subscription management, Terms, Privacy, Sign out, and Delete account.
- Camera and Photo Library permission prompts are deferred until the matching feature is used. Microphone, live location, Face ID, Reminders, and photo-write permission descriptions are absent.
- App metadata no longer says the app is free or that every plan includes a trial. Prices and renewal behavior are described accurately.
- Privacy, Terms, and Support now use the verified `shelvr-web.vercel.app` deployment because `shelvr.app` currently serves an unrelated product.

## Remaining release gates

- Connect a dedicated App Store Connect API key to RevenueCat so product store status and localized price changes can be verified automatically.
- Change the RevenueCat paywall purchase button from **Start 3-Day Free Trial** to **Continue**, then publish the paywall. Keep the Annual-only trial explanation below it.
- Publish App Privacy with Search History added for product-search queries.
- Complete a clean App Store sandbox purchase and restore on iPhone and iPad.
- Inspect the final signed IPA and upload it to App Store Connect.
- Update review notes, attach the reviewer walkthrough, resolve the rejected version item, and resubmit the existing multi-item submission.
