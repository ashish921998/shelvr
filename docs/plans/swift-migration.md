# Swift migration plan

Goal: replace the Expo client in `apps/native` with a native SwiftUI app in `apps/ios`. The
Convex backend in `apps/native/convex` stays as it is. The new app ships as an update to the
same App Store app, so every installed user keeps their account, saves and subscription.

Each milestone below is one pull request. It lands on `main` only when its checks pass. The
Expo app keeps shipping until the Swift app passes final QA.

## Fixed decisions

- **Same identity.** Bundle id `app.shelvr.save`, team `WJP847UZY2`, app group
  `group.app.shelvr.save`, URL scheme `shelvr`. Apple native sign-in checks the token
  audience against the bundle id, and RevenueCat, push and universal links key on it too.
- **Two build variants.** Debug is `app.shelvr.save.preview` with the `shelvr-preview`
  scheme, on the dev deployment (`amicable-antelope-639`), so it installs beside the Expo dev
  client (`app.shelvr.save.dev`) instead of replacing it. Release is `app.shelvr.save` on
  production (`amiable-setter-120`). `AppEnvironment` refuses a Debug build that points at
  production and a Release build that points anywhere else, so a dev session never writes
  production data.
- **One OAuth callback path.** Google sign-in returns to `<scheme>://auth/callback` in both
  variants. Both deployments already allow it, so the path tested in Debug is the one
  production uses.
- **iOS 18 minimum.** The Apple place card (`MKMapItemDetailViewController`) needs it. The
  Expo app already targets iOS 18.
- **No backend changes.** The Swift app calls the same public functions with the same
  argument shapes. A backend change, if one is ever needed, follows the expand and contract
  rule in `CLAUDE.md` and carries the `Convex-Api: changed` trailer.
- **Logic lives in `ShelvrKit`.** `apps/ios/ShelvrKit` is a Swift package with everything that
  can run without a screen: configuration, the Convex Auth session, URL routing, the ports
  of `convex/model` rules. `swift test` runs it on the Mac in seconds, with no simulator and
  no Metro. The Xcode project holds only views and Apple-framework glue.
- **Official SDKs.** `convex-swift` (ConvexMobile 0.8.2) for live queries,
  RevenueCat `purchases-ios` with RevenueCatUI, the PostHog iOS SDK, MapKit for maps.

## Milestones

| #   | Pull request           | What it delivers                                                                                                                                                                                                   | Proof                                                                                                                                          |
| --- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Foundation             | Xcode project, `ShelvrKit`, Convex client, Convex Auth session (Apple, Google, anonymous in Debug), sign-in screen, signed-in placeholder                                                                          | `swift test` (unit tests, a live test and a 65-minute token expiry soak on the dev deployment); simulator screenshots of sign-in and signed-in |
| 2   | Upgrade continuity     | Dropped. With few users, existing users sign in and onboard again after the update, as with the session, and Siri gets new capture credentials. Milestone 11 reads the Expo push installation id                   | None                                                                                                                                           |
| 3   | App shell and links    | Map and Library tabs, the tab bar (+, Go out), one URL parser for every link shape old builds, pushes, widgets and Siri use (retired routes open Home)                                                             | Table test ported from `home-href.test.ts` and `+native-intent` cases                                                                          |
| 4   | Saving                 | Paste a link, native share extension, photo saves (Pro), App Intents and Siri, Recent Saves widget                                                                                                                 | Share a reel from Safari on the simulator; the save settles with a place                                                                       |
| 5   | Library                | Home feed (paged `items:listItemsPage`), Recents, Cities, All saves, item detail, edit places, review and unplaced saves                                                                                           | Screenshots against the Expo build with the same dev fixtures                                                                                  |
| 6   | Map                    | MapKit map with pins and clusters, Discover places by area (`places:inArea`, same power-of-two boxes), filters, place card, a redesigned opening camera                                                            | Golden boxes from the TypeScript zoom helpers; simulator walk-through                                                                          |
| 7   | Paywall and plans      | RevenueCat with `appUserID` = Convex `users._id`, the dashboard paywall with its custom variables, the Pro gate (`pro_required`), free saves, plan gate, Customer Center, trial reminders, cancel survey           | Sandbox purchase on the dev RevenueCat project; `subscriptions:getEntitlement` flips                                                           |
| 8   | Onboarding and account | Onboarding steps, Profile, Settings, sign-out (revokes capture tokens), account deletion                                                                                                                           | Fresh install walk-through; `accountDeletion.test.ts` is unchanged                                                                             |
| 9   | City page and plans    | City page and map, Plan a date, Plan a trip, vote links and the Ask sheet                                                                                                                                          | Golden vectors for the ported vote, date and stamp rules                                                                                       |
| 10  | Social and Passport    | Shared lists and invites, Trips tab, Passport, city stamps, passport cards                                                                                                                                         | Two simulator accounts join one list                                                                                                           |
| 11  | Platform               | Push through the Expo push service (APNs token exchanged for an `ExponentPushToken`, `notifications:registerDevice`), notification routing, the nine locales from `en.json`, PostHog events with the current names | Push to the dev build; locale snapshot in French and German                                                                                    |
| 12  | Release                | Signed TestFlight build and store metadata                                                                                                                                                                         | TestFlight install over the current App Store build                                                                                            |

Map follow-ups after milestone 6 are explicit camera commands, simulator verification of
gesture handling, and shared Expo parity fixtures for the emoji tables, nearby reach and
search ranking. Showing partial Discover coverage also remains a follow-up.

## Gates that wait for Ashish

- **App Store submission** of the Swift build.
- **Deleting the Expo client.** After the Swift app is live and the production channel shows
  no Expo bundle still calling an old function shape, remove `apps/native/src`, the Expo
  config, the OTA workflows and the fingerprint tools. The backend then moves to
  `apps/backend`.

The Swift CI workflow runs the package tests and arm64 simulator build on changes to
`apps/ios`, the shared locale JSON files, or the workflow itself.

## Risks and how each milestone handles them

- **Signed-out users after the update.** Accepted. The Swift app does not import the Expo
  build's Convex Auth session, so every user signs in once after the update. With few users,
  importing would not justify its cost: a second session store, a handoff state, and a stale
  Expo token that can replace a newer Swift session. Production builds offer only Apple and
  Google sign-in, so signing in again returns the same account. The Expo refresh token stays
  unused in the Keychain (service `app:no-auth`).
- **Push stops or doubles.** The backend sends only through Expo. The Swift app must register an
  `ExponentPushToken`, reuse the Expo installation id so the token does not change, and keep
  revoking old tokens on sign-out. A new installation id gives a second token for the same
  phone, and every push arrives twice. Milestone 11 reads the id the Expo build stored
  before registering: a Keychain generic password with service = bundle id and
  account = `EXDeviceInstallationUUIDKey` (expo-notifications 58.1.5).
- **Duplicate saves.** Retries must reuse the same `operationId` (`share:<uuid>`,
  `link:<uuid>`, `image:<uuid>`, `siri:<uuid>`).
- **Client copies of server rules drift.** Pin dedup, kinds and emoji, visited matching and vote
  tallies run on the client today. Each port gets golden vectors generated from the TypeScript
  functions, so a server change that the Swift copy misses fails a test.
- **The Expo app keeps changing.** Features that land in `apps/native` after this plan need a
  port. Each milestone starts by diffing its area against the commit this plan was written on.
- **Lost device state.** MMKV state (last map camera, splash day, the persisted query cache) is
  not carried over. The first launch opens the map on a fitted view. This is accepted.

## Not ported

Old-build backend functions with no current caller stay on the backend and get no Swift
screen: `trips.ts`, `tripData.ts`, `plans.ts`, `places:forMap`, `aiConsent:*`,
`notifications:getDigest`, `demo:createDemoItem` and the space CRUD. Android branches, the
`expo-updates` settings row, and the retired exit offer are dropped.
