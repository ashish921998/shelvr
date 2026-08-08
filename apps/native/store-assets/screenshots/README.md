# App Store screenshots (framed)

Marketing screenshots for the iPhone 6.9"/6.7" display slot (`IPHONE_67`), 1320×2868,
no alpha channel. Composed from real app UI captures with a brand gradient + Satoshi-Bold
caption. Narrative order: Save → Feed → AI → Spaces.

These are **staged** — they are NOT on the live 1.0.0 submission (screenshots are locked
while a version is in review). Apply them to the next version:

```sh
# from apps/native, with a version in an editable state (e.g. PREPARE_FOR_SUBMISSION)
asc screenshots upload \
  --app 6798143550 \
  --version <VERSION_STRING> \
  --path store-assets/screenshots/en-US \
  --device-type IPHONE_67
```

Regenerate: see the `magick` pipeline in the commit that added these (brand gradient
`#F2E4CC`→`#FBF7EF`, card width 1000px, rounded 72px, drop shadow, caption pointsize 104).
