# Push notification builds and updates

This is the build, credential and OTA reference. For what Shelvr sends, when it
sends it, and the budget every notification kind competes for, see
[contextual notifications](contextual-notifications.md).

Weekly shelf notifications use Expo Push Service, APNs on iOS, and FCM v1 on
Android. Permission, a registered device token, an enabled weekly shelf preference,
and unread eligible saves are all required for a digest. Token-service failures
remain errors; they must not be treated as denied permission.

Foreground retries stop for the structured token-ownership conflict, until a new
session starts or a token-rotation/explicit registration succeeds. Network and
temporary server failures remain retryable. Deploy the compatible Convex error-code
change before publishing this client update; older servers redact the plain error
and cannot tell the client that this rejection is permanent.

## Native configuration

- Every Android EAS build requires the `GOOGLE_SERVICES_JSON` file variable in
  its selected environment. Its Firebase clients must match the application id:
  `app.shelvr.save`, `app.shelvr.save.preview`, or `app.shelvr.save.dev`. A shared
  file can contain all three clients from the same Firebase project. The build
  validates that its matching client exists before compiling.
- Assign an FCM v1 service account for the matching Firebase project in EAS
  credentials for each Android application id. This is separate from the client
  `google-services.json` and from Google Play submission credentials.
- iOS uses the `expo-notifications` config plugin and an EAS APNs push key plus
  a provisioning profile with the push entitlement. It does not use the Android
  Firebase file. Provisional and ephemeral iOS notification authorization are
  valid for token registration.
- After changing native configuration, build and install a new binary. Android
  builds made without Firebase cannot gain working FCM registration through OTA.

## Fingerprint-compatible OTA

Keep the `fingerprint` runtime policy. Do not restore an old `eas.json` or force
an old runtime to send code to a binary with different native configuration.

`GOOGLE_SERVICES_JSON` is a secret EAS file variable. EAS writes it under
`eas-environment-secrets/` on the worker, and a local machine cannot download
it. `apps/native/.fingerprintignore` leaves that file out of the fingerprint, so
`eas build` and `eas update` compute the same Android runtime on a local machine
and on a worker. Without it, the worker rejects every build started from a local
machine with "Runtime version calculated on local machine not equal to runtime
version calculated during build."

The Firebase file therefore does not change the fingerprint. A build made after
replacing it keeps the runtime of builds made before, so later OTAs reach both.
When the new file must not share updates with older binaries, commit a change
that the fingerprint does include, such as a native config change, in the same
release. The workflow below remains the default route for updates:

```sh
cd apps/native
npx eas-cli@24.6.0 workflow:run native-update.yml
```

Select the installed binary's build profile. The workflow maps it to:

| Build profile         | Channel       | Environment / app variant | Android architectures |
| --------------------- | ------------- | ------------------------- | --------------------- |
| production            | production    | production                | production defaults   |
| internal-test         | internal-test | production                | production defaults   |
| preview               | preview       | preview                   | preview defaults      |
| development           | development   | development               | arm64-v8a             |
| development-simulator | development   | development               | x86_64                |

The workflow is manual and checks both backend URLs plus the Firebase file for
Android. Release or distribute a build with the new fingerprint first. An OTA targets only binaries with a matching
runtime; publishing it does not upgrade an old binary's native configuration.

## Device verification before release

On a physical iPhone and an Android device with Google Play services:

1. Install the new build, sign in, and enable Weekly shelf. Accept permission.
   Confirm the preference saves and token registration succeeds.
2. Send a test notification to that test device through Expo, check its receipt,
   and verify receipt in foreground, background, and with the app closed.
3. Tap a weekly digest notification and confirm it opens the intended digest.
4. Deny permission, then enable it through the app's Settings shortcut. Returning
   to Shelvr must retry registration without restarting the app. The weekly
   reminder prompt stays available; tap Remind me again to finish enabling it.
5. Launch offline, reconnect, and foreground the app. Registration must recover.
6. Sign out and confirm the previous account no longer receives notifications on
   that device. Repeat for a second account.

Passing unit tests or Expo accepting a push ticket does not prove device delivery;
check both the provider receipt and the notification on the device.
