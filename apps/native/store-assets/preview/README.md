# App preview video (6.9")

`shelvr-preview-6.9.mp4` — app preview for the iPhone 6.9" display slot.

| Spec | Value |
| --- | --- |
| Resolution | 1290 × 2796 (portrait) |
| Codec | H.264 (high profile), yuv420p, limited (tv) range |
| Frame rate | 30 fps |
| Duration | ~28s (App Store allows 15–30s) |
| Audio | none |

Flow: home feed → open a saved link (AI title / summary / tags) → Spaces grid →
a Space's contents → Search "travel" → results. Captured on a seeded demo account
(see `convex/seed.ts`, throwaway) with the 9:41 status bar.

Like the screenshots, this is **staged** — it is NOT on the live 1.0.0 submission
(previews lock while a version is in review). Apply it to the next version:

```sh
# from apps/native, with a version in an editable state
asc app-previews upload \
  --app 6798143550 \
  --version <VERSION_STRING> \
  --path store-assets/preview/shelvr-preview-6.9.mp4 \
  --device-type IPHONE_67
```

Regenerate from a fresh argent screen recording (showTouches + trimStatic, video-watermark
disabled), then:

```sh
ffmpeg -i <raw>.mp4 \
  -filter:v "setpts=PTS/3.5,scale=1290:-2,crop=1290:2796,fps=30,format=yuv420p" \
  -an -c:v libx264 -profile:v high -pix_fmt yuv420p \
  -colorspace bt709 -color_primaries bt709 -color_trc bt709 -color_range tv \
  -movflags +faststart -crf 20 shelvr-preview-6.9.mp4
```

Tune the `setpts` divisor so the result lands in 15–30s (raw length ÷ divisor).
