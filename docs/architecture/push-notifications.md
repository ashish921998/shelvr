# Push notification builds and updates

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

### Two layers guard OTA compatibility

**On a pull request, an early warning.** CI computes the fingerprint of the
branch and of its base in one environment (`tools/verify-native-fingerprint.mjs
--warn-only`) and lists each source that moved. It never fails the check. A
native change is a legitimate thing to merge, and merging it harms nobody. A
commit in the range carrying the `Native-Fingerprint: changed` trailer
acknowledges the move and quiets the warning. Treat the warning as a release
note: the next update needs a store build first. The same comparison runs
locally with `pnpm run verify:fingerprint origin/main HEAD`.

**At publish time, the enforcing gate.** The `before_update` hook in
`native-update.yml` runs `tools/verify-ota-compatibility.mjs --profile <profile>
--platform <platform>`, which compares the fingerprint the publish is about to
be stamped with against `apps/native/released-builds.json`, the registry of
builds users actually have. Anything but a match blocks the publish: a moved
fingerprint, a profile or platform with no recorded release, or a fingerprint
the toolchain could not compute. It runs inside the publishing job so the
environment it fingerprints in is the one the update is stamped with, which a
separate job would have to be kept identical to by hand.

A blocked publish is not a problem to work around. When the fingerprints
differ, **no update can reach the released binary at all**. Its runtime version
is fixed at build time and an OTA only reaches installs whose runtime version
matches exactly. Users on that binary stay where they are until they upgrade
through the store, so the answer is a new store build, not a retry.

### Recording a release

`apps/native/released-builds.json` holds one entry per build profile and
platform, or `null` when no release has been recorded. It starts null for every
profile but `production`, because the newest successful EAS build is not
evidence that anyone has it installed. The gate blocks until a maintainer
records a real release, which is the intended behaviour.

After a build reaches users, read the fingerprint it runs and record it:

```sh
cd apps/native
npx eas-cli@24.6.0 fingerprint:compare --build-id <build-id> \
  --environment <environment> --json
```

`<environment>` is the profile's environment from the table above. The output
is `{fingerprint1, fingerprint2}`, where `fingerprint1.hash` is the
build's and `fingerprint2.hash` is the local project's. Take `fingerprint1.hash`.
Note that the command **exits 0 even when the two differ**, so read the hashes
rather than the exit code. Then set `buildId`, `fingerprint`, and a `release`
string naming the version, build number, store, and release date, so a later
blocked publish says which binary it is blocked by.

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
