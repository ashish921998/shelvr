# Review notes for the Swift iOS build

Use these notes when selecting the Swift build for App Review. The existing [Expo review notes](app-review-notes.md) apply while the Expo build is selected.

## App Review Information

Shelvr saves links and photos, identifies places, and helps people plan dates and trips. This update replaces the iOS client with SwiftUI and uses the same Shelvr account and subscription. After upgrading, sign in again with the original Apple or Google account to see existing saves.

1. Open Shelvr and choose Continue with Apple or Continue with Google. You can use your own Apple account. The production build does not require an invitation or a developer-issued account.
2. On a fresh install, tap Get started. Choose or skip the questions about saves, goals and cities. Choose a city to see its practice reel. Use Share and then Shelvr inside the practice step, or skip it. Continue through the three places, the carousel and the optional notifications prompt.
3. An eligible account sees the RevenueCat offering. The plan picker shows the storefront price, renewal terms, Restore, Terms and Privacy. Use a sandbox purchase or restore to test Pro. An existing Pro account skips the onboarding paywall. When the free plan is open, closing the paywall allows access to Maps and Library without purchasing.
4. On Map, tap +, then Paste a link. Paste a public reel or a web page naming a place and tap Save. You can also open a page in Safari, share to Shelvr, confirm in the extension and return to Shelvr to finish processing. Open Library to inspect recent saves, all saves or a city's places. Reading a link can take time.
5. Use Go out to plan from saved places. Use Passport to view visited places and a city's card. A shared-list link opens a preview; joining requires an explicit action and sign-in. Sharing the link does not expose the rest of the account.
6. The Profile button opens appearance, feedback and Settings. Restore Purchases and subscription management are available from Settings. Delete account shows a separate confirmation explaining which data is removed. Deletion does not cancel an Apple subscription.

## TestFlight What to Test

Install this build over the current App Store app on a test iPhone. Sign in with the same account and check existing saves and subscription access. Share a reel from Safari, wait for it to settle, open a pin and inspect the source save. Check a shared-list link, a Recent Saves widget, a Siri save, and notification delivery and tap routing. Include the iOS version and observed screen when reporting a problem. Do not include private links, screenshots of personal saves or account identifiers.
