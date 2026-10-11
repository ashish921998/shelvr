# Local QA: running a checkout on a simulator

How to get a branch or worktree running on a simulator and into the state a
check needs. Device ids, installed builds and anything else that belongs to one
machine stay out of this file.

Each "seen" date is when the behaviour was last observed. Re-check an old one
before relying on it.

## A worktree needs three things

1. **Dependencies.** `pnpm install --frozen-lockfile --prefer-offline` from the
   worktree root.
2. **`apps/native/.env.local`.** It is gitignored, so a fresh worktree has none.
   Copy it from the main checkout.
3. **Its own Metro port.** 8081 and its neighbours usually belong to another
   checkout or session. From `apps/native`:

   ```bash
   npx expo start --port 8091 --dev-client < /dev/null
   ```

   Do not set `CI=1`. It turns off file watching, so Metro keeps serving the
   code it started with (seen 2026-09-16).

`npx convex dev --once` pushes the checkout's `convex/` to the dev deployment.
That deployment is shared, so a branch with schema changes changes it for every
other checkout.

## Pointing the dev client at your Metro

Terminate the app, then open the dev client link for your port:

```bash
xcrun simctl openurl <udid> 'exp+shelvr://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8091'
```

- **Confirm the bundle is yours before trusting the screen.** The debugger
  status must report your worktree as its project root. A Release build embeds
  its JavaScript and never contacts Metro, yet it still shows a normal Home
  screen (seen 2026-09-19). If the status shows no app connected, install a
  Debug build.
- **Never load a second server into a running app.** Tapping another server row
  in the launcher after one has started loading leaves Unistyles unconfigured:
  every `StyleSheet.create` throws and every route reports a missing default
  export. Terminate and relaunch (seen 2026-09-16).
- The launcher may resolve the host to the LAN address instead of the
  `127.0.0.1` you passed. That is expected.

## Building the dev client

The runtime version uses the fingerprint policy (`app.json`), so a dev client
only loads bundles whose native fingerprint matches. Rebuild with
`npx expo run:ios` after a native dependency or config plugin changes.

- **Set a UTF-8 locale.** In a shell without one, `pod install` dies with
  `Unicode Normalization not appropriate for ASCII-8BIT`. Prefix the command
  with `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8` (seen 2026-09-25).
- **Do not pipe `expo run:ios` through `tail`.** The pipeline's exit code hides
  the failure. Redirect to a log file and read that.
- **A stale `ios/` breaks the build.** `apps/native/ios` is gitignored and
  reused between builds. After a font or asset swap, run
  `npx expo prebuild -p ios --clean --no-install` first (seen 2026-09-25).
- `--port` and `--no-bundler` are mutually exclusive on `expo run:ios`. Start
  Metro separately and pass only `--no-bundler`.

## Signing in and seeding data

- **Sign-in:** the anonymous "Continue without account" button. It shows only on
  the development variant with `EXPO_PUBLIC_AUTH_ENABLE_ANONYMOUS=true`
  (`src/lib/anonymous-auth.ts`; any other value hides it), and the dev
  deployment must set `AUTH_ENABLE_ANONYMOUS=true`.
- **Fixtures:** `devFixtures.resetCurrentUser` seeds items, spaces and a Pro
  subscription. Home cards carry `fixture-item-*` test ids.
- **Saved flows:** `apps/native/.argent/flows`.

## Getting into a specific state

- **First-run onboarding.** Terminate the app, then
  `xcrun simctl keychain <udid> reset`. This clears the auth token, the
  onboarded flag and pending onboarding progress together, so the next launch
  is a new anonymous user with an unused demo save. No reinstall needed.
- **The paywall.** A development anonymous user never sees it:
  `getEntitlement` in `convex/subscriptions.ts` returns `lifetime` for them. To
  see the real sheet, either sign in with a real account, or temporarily make
  `useEntitlement` return a lapsed, non-entitled state after its effects (so
  hook order is preserved) and revert the patch afterwards. Then Home, "Paste a
  link", "Link" reaches the Pro gate. "Paste a link" does nothing unless a
  URL is on the device clipboard. `pbcopy` reads standard input:
  `printf '%s' '<url>' | xcrun simctl pbcopy <udid>`.
- **Reduced motion.**
  `xcrun simctl spawn <udid> defaults write com.apple.Accessibility ReduceMotionEnabled -bool true`,
  then relaunch the app. Set it back to `false` when done.

## Reading the screen

- The accessibility tree does not list Home cards; the React component tree
  does.
- While a Reanimated `entering` animation runs, the accessibility tree shows
  the node twice. Wait for the screen to settle before calling a duplicate a
  defect.
- The floating dev-tools button sits over the Home header's Add button, and the
  tree carries no z-order, so a tap aimed at Add can open the dev menu. Go
  through "Paste a link" or dismiss the dev button first.

## Tests and the router tree

Never put a `*.test.tsx` under `src/app`. Expo Router bundles everything in
that tree, so a test there pulls Vite into the app bundle and the dev client
red-boxes. `pnpm check` does not catch it, because Vitest runs the file fine.
Put screen tests in `src/lib` and import the route through the `@/app/...`
alias.

## Android

- **Local emulator.** `adb reverse tcp:<port> tcp:<port>`, then open the dev
  client link with
  `adb shell am start -a android.intent.action.VIEW -d '<dev client url>' app.shelvr.save.dev`.
- **Share intents.**
  `adb shell am start -a android.intent.action.SEND -t text/plain --es android.intent.extra.TEXT '<url>' -p app.shelvr.save.dev`.
  The dev client cannot test a cold-launch share: from a stopped app the
  launcher's server picker swallows the intent. Only a warm share works. To
  replay one, send the same intent with `-f 0x00100000`.
- **A true cold-start share needs a release build** (seen 2026-09-23):
  - `APP_VARIANT=preview npx expo prebuild -p android --no-install --clean`
    produces `app.shelvr.save.preview`, which installs beside the dev client.
    Restore afterwards with a plain prebuild.
  - Add `debuggable true` to the release block of the generated
    `android/app/build.gradle`, or RevenueCat rejects the test key and closes
    the app.
  - The preview variant never shows the anonymous sign-in button, so sign in
    with a real account.
  - Build with
    `./gradlew :app:assembleRelease -PreactNativeArchitectures=arm64-v8a -x lintVitalAnalyzeRelease "-Dorg.gradle.jvmargs=-Xmx4096m -XX:MaxMetaspaceSize=1536m"`.
    The default metaspace is too small. If CMake reports missing Skia
    binaries, run `npx install-skia` first.
- **EAS remote simulator.** Remote Android emulators are x86_64. The
  `development` profile builds arm64 only, so its APK installs and then crashes
  on launch; use the `development-simulator` profile in `eas.json`. A remote
  session cannot reach local Metro, so start Metro with `--tunnel` and open the
  dev client link with the tunnel URL. Stop the session when done.
