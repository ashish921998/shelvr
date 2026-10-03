<!-- Lead with what changes for the person using the app, then how. Delete sections that do not apply. -->

Before:

After:

How:

## Screenshots

<!-- UI changes only. Name the device, build and commit the shots were taken at. -->

## Checks

- [ ] `pnpm run check` passes
- [ ] New or changed visible copy is in all nine catalogs and `pnpm localization:generate` was run
- [ ] Verified on a simulator or device (say which), or not applicable

## Release notes

<!-- Keep the lines that apply and delete the rest. Each trailer goes on a commit in this PR. -->

- Public Convex function `args` or `returns` changed: add the `Convex-Api: changed` trailer and say how installed apps survive it.
- Native fingerprint moved (native module, config plugin, `app.json`, `app.config.js`): add the `Native-Fingerprint: changed` trailer. OTAs wait for a store build.
- Backend must deploy before the client: say so.
