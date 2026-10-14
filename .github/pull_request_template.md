<!-- Lead with what changes for the person using the app, then how. Delete sections that do not apply. -->

Before:

After:

How:

## Verification

<!--
CI fails this pull request, once it is out of draft, until every subsection is filled in
(tools/verify-pr-evidence.mjs). Renovate and Dependabot pull requests are exempt.
Only claim what was actually run and seen. "Should work" is not verification.
-->

### What I ran

<!-- Commands, tests, and manual checks, each with its result. For example:
- `pnpm run check`: passed
- iOS simulator (iPhone 17, iOS 27): saved a link, it filed into Recipes
- Live test against 5 real Pinterest links: 5 of 5 saved with images
New or changed visible copy belongs in all nine catalogs, with `pnpm localization:generate` run.
-->

### Evidence

<!--
Proof a reviewer can open: a CI run link, pasted output, or a read-back of a setting after saving.
For any change a person can see, screenshots or a recording go here, naming the device, build and
commit they were taken at. Drag images into this box.
CI requires one when the pull request touches UI files (screens, styles, motion, copy, assets,
native view modules, app intents, app config, push copy, apps/web UI). If those files changed but
nothing on screen did, say why here; only the owner waives the screenshot, with the "no-ui-change"
label (a rule, not a check: CI cannot tell who added the label, so agents never add it).
Paywall changes live in RevenueCat, so CI cannot see them: they still need screenshots.
-->

### Not verified

<!-- What was NOT checked, so nobody assumes it was. For example: real iPhone, Android, TikTok (blocked in India), production data. Write "Nothing" only if that is true. -->

## Release notes

<!-- Keep the lines that apply and delete the rest. Each trailer goes on a commit in this PR. -->

- Public Convex function `args` or `returns` changed: add the `Convex-Api: changed` trailer and say how installed apps survive it.
- Native fingerprint moved (native module, config plugin, `app.json`, `app.config.js`): add the `Native-Fingerprint: changed` trailer. OTAs wait for a store build.
- Backend must deploy before the client: say so.
