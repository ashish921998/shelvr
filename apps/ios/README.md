# Shelvr for iOS

Open `Shelvr.xcodeproj` in Xcode and run the Shelvr scheme on an iOS 18 or newer device. Debug installs Shelvr Preview beside the Expo development app and connects to the development Convex deployment.

## Development

Prepare the development SDK settings from `apps/native/.env.local` or the current environment. The scripts write the gitignored `Config/Secrets.xcconfig`.

```sh
cd apps/ios
Config/prepare-billing.sh Debug
Config/prepare-analytics.sh Debug
swift test --package-path ShelvrKit --skip Live
```

The RevenueCat development build uses `EXPO_PUBLIC_REVENUECAT_TEST_KEY`. Analytics uses `POSTHOG_PROJECT_TOKEN` and `POSTHOG_HOST`. A signed simulator build is needed to exercise persistent sign-in and extensions. The compile-only CI build targets arm64.

## Release builds

Release uses the existing App Store bundle, `app.shelvr.save`. Prepare the production settings in the release checkout using the project's EAS environment. From `apps/native` run:

```sh
eas env:exec production '../ios/Config/prepare-billing.sh Release && ../ios/Config/prepare-analytics.sh Release' --non-interactive
```

Archive the Release scheme for a generic iOS device. Use a build number newer than the latest App Store Connect build for all targets. The production SDK inputs are `EXPO_PUBLIC_REVENUECAT_IOS_KEY`, `POSTHOG_PROJECT_TOKEN` and `POSTHOG_HOST`. The full migration plan and release gates are in [the Swift migration plan](../../docs/plans/swift-migration.md).
