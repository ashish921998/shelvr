# Shelvr 1.0.2 analytics release

This records preparation and build checks performed on September 9, 2026.
Build 25 predates the interview changes and the later photo fixes now on main;
it is not proof that those changes are present in a release binary. A new build
and signed-device QA are required to release the combined changes. ActivationPal
removal is maintained in a separate PR; merge it before making that build.

## Scope

Ship the existing onboarding, paywall, saving, and server payment measurement.
User explicitly chose **PostHog only** on September 9. ActivationPal imports,
native module, dependency, lockfile entries, Info.plist configuration, and required
build key have been removed. Production session replay is disabled pending visual
masking verification. This does not disable PostHog funnel events.

The native release includes the current mainline fixes through `3040441` plus the
release changes above; it is not an analytics-only backport to the August binary.

## Verified preparation

- Version changed to 1.0.2; new App Store version ID:
  `535975bd-ae2c-4114-bbbe-6213445581b6`.
- Version is prepared with manual release, carried-forward English metadata, new
  release notes, and generic keywords replacing competing app names.
- App Privacy now includes device identifiers linked to the user for analytics.
  Readback matches `apps/native/privacy.json`; published state is confirmed true.
- Hosted privacy disclosure already includes product analytics and masked replay.
- Subscription validator: 3 products, 0 errors/blockers. The 3 warnings concern
  optional subscription promotional images.
- Native lint, TypeScript, and all 411 tests across 33 files passed after removing
  ActivationPal. Lockfile changes remove only the ActivationPal entries.
- Expo module resolution no longer includes ActivationPal.
- Existing development client on iPhone 17 Pro Max launched current JavaScript
  successfully after a full process restart and selecting Metro 8081.

## Build history

- Build 24 (`dad2481c-fc09-42b3-ad4d-d62e8d0d0b38`) failed before compilation because
  the now-removed ActivationPal build guard required an absent EAS environment key.
- Replacement build 25:
  https://expo.dev/accounts/ashish921998/projects/shelvr/builds/9db210fb-8194-4aef-98ca-7ae346ad0a54
  EAS build finished successfully. Packaged IPA verification confirmed version
  1.0.2/build 25, production bundle/backend, PostHog, no ActivationPal reference,
  and both share/widget extensions. SHA-256:
  `79ddc3753b4950878336a125d23eee2790c3cebc86ea8b9f17ef2debd7faaa81`.
  Apple processed the build as `VALID`, attached it to version 1.0.2, and reports
  internal TestFlight state `IN_BETA_TESTING`. Build ID:
  `5a68b825-1401-4da5-875a-4573a13bca6e`.
  Deep App Store readiness validation returned zero errors and zero blockers;
  remaining validator warnings concern optional subscription promotional images.
  App Review submission has **not** been performed. The remaining release gate is
  signed-device QA, including Apple sandbox purchase/restore and event delivery.
  Do not treat the version as shipped until signed-device checks, validation,
  and App Review have succeeded.

Apple upload ID: `5a68b825-1401-4da5-875a-4573a13bca6e`. Processing reported warning
90683 for a missing `NSLocationWhenInUseUsageDescription` in the main app. The same
warning exists on the live build 23. It is not reported as an upload error; the app
uses saved photo coordinates rather than requesting live device location. Review
the SDK reference/purpose-string requirement before a later submission; do not
silently add a misleading claim that live location is currently required.

## TestFlight test notes

Use a real iPhone and an Apple sandbox/TestFlight account for purchase checks.
Do not use a production charge as a substitute for sandbox verification.

1. Fresh install: complete onboarding and sign in. Verify first-open, onboarding
   step/completion, and authentication events in PostHog, with the correct environment.
2. Open the Pro paywall. Cancel it, then reopen; check attempt and cancellation
   events share the attempt ID. An interrupted or still-open sheet is not a
   confirmed cancellation. Restores are not purchases.
3. Complete the annual sandbox purchase. Confirm the one-week trial, server
   entitlement update, ability to save, and sandbox exclusion from production
   payment metrics. Repeat monthly purchase and restore with suitable clean test
   state. Verify identity matches the signed-in account.
4. Save a link, image, and note; confirm retained items and canonical `item_saved`
   delivery. Open a save later and perform an action. Do not double count client
   save events plus the backend event as two saves.
5. Cold launch and resume after backgrounding. Confirm the app reaches the home
   screen and does not remain on “Opening Shelvr.”
6. Confirm production replay stays disabled. Native development replay behavior
   does not establish production release behavior.

Apple sandbox purchase verification on a physical device remains outstanding.
No physical iPhone is connected to this workspace. Development Test Store checks
from the prior billing task are not proof of Apple payment processing.

## Development-session finding

A long-running development session was found with Convex auth loading and a stopped
WebSocket. Full bundle reload and subsequent clean native launch recovered to the
home screen. A possible SDK reauthentication race was observed but not causally
proven; no workaround was added to this release. Include background/resume and token
refresh in signed-build QA. A clean launch pass does not resolve every long-session
failure mode.

## Launch preparation

[Reddit and short-video plan](../early-user-recruitment.md) contains the founder
post, three video briefs, channel links, and measurement caveats. No posts or ads
have been published and no ad spend is authorized. Account/community eligibility
must be checked before publishing; paid campaigns require a target market and cap.
