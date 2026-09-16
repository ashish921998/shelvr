# Push notification builds and updates

Weekly shelf notifications use Expo Push Service, APNs on iOS, and FCM v1 on
Android. Permission, a registered device token, an enabled weekly shelf preference,
and unread eligible saves are all required for a digest. Token-service failures
remain errors; they must not be treated as denied permission.

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

`GOOGLE_SERVICES_JSON` is a secret EAS file variable. Local `eas update` cannot
download it merely by selecting `--environment production`, so its Android
fingerprint can differ from the build worker's fingerprint. Publish production
updates on EAS workers, where the same file is available:

```sh
cd apps/native
npx eas-cli@24.6.0 workflow:run production-update.yml
```

The workflow is manual, uses the production environment and application variant,
and checks both backend URLs plus the Firebase file for Android. Release a store build
with the new fingerprint first. An OTA targets only binaries with a matching
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
