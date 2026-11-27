# Review notes for the Swift iOS build

Before copying the walkthrough into App Store Connect, run it on the selected Swift TestFlight build and verify the demo account or Apple-approved demo mode that App Review will use. The [Expo review notes](app-review-notes.md) apply while an Expo build is selected.

## App Review Information

Shelvr saves links and photos, identifies places, and helps people plan dates and trips. This update uses SwiftUI and keeps the same Shelvr account and subscription. After updating, sign in with your original Apple or Google account to see your existing saves.

1. On the welcome screen, tap Get started for a new account or Sign in for an existing account. New users can answer or skip the questions about saves, goals and cities. They can share the practice reel to Shelvr or skip it. Choose Continue with Apple or Continue with Google when prompted.
2. An eligible account sees the RevenueCat offering. It shows the storefront price, renewal terms, Restore, Terms and Privacy. An existing Pro account skips the onboarding paywall. When free access is available, closing the paywall lets the reviewer open Map and Library.
3. On Map, tap +, then Paste a link. Paste a public reel or webpage naming a place and tap Save. Or share a public page from Safari to Shelvr, confirm in the extension and return to the app. A share queued before sign-in finishes after sign-in. Shared text without a link saves as a note. Find the saved item in Library after it finishes processing.
4. On Map, tap Search places to find a saved or shared place. Tap a result or a pin to see the place. Use Go out to plan from saved places. Use Passport to view visited cities and their cards. A shared-list link opens a preview. Joining requires an explicit action and sign-in.
5. Open Profile, then Settings. Restore Purchases, Manage subscription, and Apple refund data sharing are in Settings. The refund row shows the current choice and lets the reviewer review the disclosure or turn sharing off. Delete account opens a confirmation describing what is removed. Manage or cancel an Apple subscription in Apple’s subscription settings.

## TestFlight What to Test

On a test iPhone, keep the current App Store app installed. Note a known save, photo and subscription state before installing the TestFlight build. Sign in with the same Apple or Google account and confirm each one after the update. Share a reel from Safari and check the saved place in Map and Library. Try sharing a link while signed out and sharing plain text.

Use an eligible free sandbox account to check purchase, cancellation, and Restore Purchases. Send a push through Shelvr and check that tapping it opens the expected screen. Test a spoken Siri save, the Recent Saves widget, a Spotlight result, and Visual Intelligence where supported.

Report the iOS version, TestFlight build number, steps and observed result. Keep private links, personal saves and account identifiers out of feedback.
