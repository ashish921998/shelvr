# Photo processing fix — 2026-09-10

## Cause

A real simulator photo upload succeeded, but classification failed with `AI_DownloadError`. Targeted, sanitized development logging identified `image_download:undici_unavailable`: the AI SDK's automatic downloader uses a dynamic `createRequire(...)("undici")` lookup that cannot resolve that module in the deployed Convex Node bundle.

The image was already in Convex storage and displayed correctly in the app. Its saved membership in Recipes remained present. The failure was the extra SDK download before vision classification, not the upload or space assignment.

## Change

The storage helper loads the uploaded file through the action's `ctx.storage.get` and passes the original bytes and stored MIME type to the model. Preserving the MIME type supports HEIC/HEIF headers that the SDK cannot detect. Both photo classification and photo-based product recognition use this path.

Missing and empty files are terminal failures for photo classification. Photos larger than 14 MiB are rejected before reading their bytes, leaving room for base64 expansion and prompts within Gemini's 20 MB inline request limit. Oversized photos are terminal too; classification retries do not consume rate-limit slots. Image space candidates are capped at 64 KiB of JSON-escaped UTF-8, with descriptions limited to 512 Unicode code points without splitting surrogate pairs. Exact space names are retained; candidates beyond the budget are omitted from AI suggestions. The item-detail notice explains these failures without offering a classification retry. Product searches record an unavailable terminal state for these inputs and block retries before consuming their own rate-limit capacity. Temporary provider errors remain retryable. Diagnostics retain safe storage-error categories without logging URLs, contents, or raw exception messages. Expected input rejections return normally instead of appearing as Convex action faults; oversized classification inputs emit rejected telemetry. The obsolete SDK downloader diagnostics have been removed. External-page fetching and its URL checks are unchanged.

New clients check the file size before upload and no longer guess JPEG when MIME metadata is absent. The server recognizes HEIF container brands from bytes, correcting absent or incorrect labels. Attachment rejects empty/oversized uploads with a structured error and deletes unreferenced rejected blobs in the same committed mutation. Completed imports and canonical retry attachments remain idempotent. Finalization also checks metadata before classification capacity is consumed; legacy invalid pending uploads remain eligible for the existing 24-hour stale-import sweep. Referenced/shared files are never deleted by rejection cleanup.

Files: `apps/native/convex/ai.ts`, `apps/native/convex/model/storedImage.ts`, `apps/native/convex/model/storedImage.test.ts`, and `apps/native/convex/ai-image.test.ts`. Droid CLI with GLM 5.3 Flash implemented the storage helper; Codex diagnosed the runtime failure, integrated the fix, added action-level regression tests, and performed Argent verification.

## Verification

- Reproduced the failure before changing the image transport, using a real photo selected in the iOS photo picker.
- Pressed **Try again** on that same failed item after the development deployment. It became ready as **Starry Mountain Night**, with six tags and its original Recipes membership. No re-upload or duplicate item was needed.
- Uploaded a different photo through the photo picker. It became ready as **Sunlit Forest Path**, with eight tags and its Recipes membership. Reloading the app preserved the result.
- The isolated PR branch passes **439 tests across 36 files**, plus lint, TypeScript, and `git diff --check`. This excludes the unrelated onboarding and feedback work in the development checkout.
- Regression tests exercise the real Convex actions with the external model mocked, verify byte identity and space preservation, cover missing/empty files, ensure product recognition uses bytes, and cover terminal failure reasons and retries. A separate test exercises the real AI SDK and Google adapter with only HTTP mocked: HEIC bytes reach the provider with the correct MIME metadata. The test does not require SDK detection to keep failing. Live simulator verification used the real model and development backend.
- Review follow-up: a valid HEIC file encoded by Apple's `sips` (24-byte `ftyp` box) failed on the development backend before MIME preservation. After deployment, tapping **Try again** on the same item succeeded with the real Gemini model.
- Review follow-up: empty and oversized files uploaded through the simulator's authenticated import APIs received `not_found` and `image_too_large`. Argent verified the photo-specific notices and absence of **Try again**. These were controlled QA files, not camera-roll samples.
- Final review verification: a valid HEIC uploaded with an intentionally incorrect JPEG Content-Type processed successfully on development. An oversized upload returned an attachment rejection before finalization. Argent verified the unavailable product-search notice without a retry chip using a controlled terminal state on the temporary QA item. Temporary QA imports were removed.
- Existing item-mutation tests use a fake clock so their queued AI jobs cannot escape into network calls during test teardown; queued-job assertions remain intact.

Screenshots: [before](qa/photo-fix-2026-09-10/before.png), [successful retry](qa/photo-fix-2026-09-10/retry-success.png), [fresh upload after reload](qa/photo-fix-2026-09-10/fresh-upload.png).

## Release status

The fix is deployed and verified on development (`amicable-antelope-639`). It has not been deployed to production. The image-processing correction is server-side. The photo-specific terminal-error wording and hidden retry controls require an updated client; the server blocks terminal retries even from older clients. Keep it separate from the larger pending onboarding/feedback release if deploying a small update.

The original participant's missing-space/X reports remain separate until their exact examples are available. This resolves the photo-processing failure observed during our QA.

Separate navigation observation: opening a different item deep link while a detail view was already open displayed the new image/body with the previous header title. Reloading displayed the correct title. This is outside the backend photo-processing fix; track it before declaring all navigation issues resolved.
