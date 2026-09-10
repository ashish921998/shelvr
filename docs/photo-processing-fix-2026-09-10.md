# Photo processing fix — 2026-09-10

## Cause

A real simulator photo upload succeeded, but classification failed with `AI_DownloadError`. Targeted, sanitized development logging identified `image_download:undici_unavailable`: the AI SDK's automatic downloader uses a dynamic `createRequire(...)("undici")` lookup that cannot resolve that module in the deployed Convex Node bundle.

The image was already in Convex storage and displayed correctly in the app. Its saved membership in Recipes remained present. The failure was the extra SDK download before vision classification, not the upload or space assignment.

## Change

`readStoredImageBytes` loads the uploaded file through the action's `ctx.storage.get` and passes the original bytes to the model. The SDK continues detecting the image format from those bytes. Both photo classification and photo-based product recognition use this path.

Missing and empty files receive stable error categories. Download diagnostics retain allowlisted categories/HTTP status codes without logging URLs, contents, or raw exception messages. External-page fetching and its URL checks are unchanged.

Files: `apps/native/convex/ai.ts`, `apps/native/convex/model/storedImage.ts`, `apps/native/convex/model/storedImage.test.ts`, and `apps/native/convex/ai-image.test.ts`. Droid CLI with GLM 5.3 Flash implemented the storage helper; Codex diagnosed the runtime failure, integrated the fix, added action-level regression tests, and performed Argent verification.

## Verification

- Reproduced the failure before changing the image transport, using a real photo selected in the iOS photo picker.
- Pressed **Try again** on that same failed item after the development deployment. It became ready as **Starry Mountain Night**, with six tags and its original Recipes membership. No re-upload or duplicate item was needed.
- Uploaded a different photo through the photo picker. It became ready as **Sunlit Forest Path**, with eight tags and its Recipes membership. Reloading the app preserved the result.
- The isolated PR branch passes **421 tests across 35 files**, plus lint, TypeScript, and `git diff --check`. This excludes the unrelated onboarding and feedback work in the development checkout.
- Regression tests exercise the real Convex actions with the external model mocked, verify byte identity and space preservation, cover missing/empty files, ensure product recognition uses bytes, and check that diagnostics do not expose URLs. Live simulator verification used the real model and development backend.
- Existing item-mutation tests use a fake clock so their queued AI jobs cannot escape into network calls during test teardown; queued-job assertions remain intact.

Screenshots: [before](qa/photo-fix-2026-09-10/before.png), [successful retry](qa/photo-fix-2026-09-10/retry-success.png), [fresh upload after reload](qa/photo-fix-2026-09-10/fresh-upload.png).

## Release status

The fix is deployed and verified on development (`amicable-antelope-639`). It has not been deployed to production. This photo fix is backend-only and does not itself require a new native build. Keep it separate from the larger pending onboarding/feedback release if deploying a small update.

The original participant's missing-space/X reports remain separate until their exact examples are available. This resolves the photo-processing failure observed during our QA.

Separate navigation observation: opening a different item deep link while a detail view was already open displayed the new image/body with the previous header title. Reloading displayed the correct title. This is outside the backend photo-processing fix; track it before declaring all navigation issues resolved.
