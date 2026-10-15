# Display font

Native headings, animated text, design-sync previews, and the marketing site use
Crimson Pro at weight 400. Satoshi remains the body and control font. The widget
uses system fonts.

Crimson Pro was chosen as the closest free match to the retired Exposure [0]
face. Measured over the 52 Latin letters at a shared x-height, its letter shapes
overlap Exposure's more than any other Google Fonts serif tried.

`CrimsonProRoman-Regular.ttf` is a static weight-400 instance of the variable
`CrimsonPro[wght].ttf` from Google Fonts at commit
`f2bd09badbc763d8757951d52deec29da27e85fb`, under `ofl/crimsonpro/`, made with
`fonttools varLib.instancer ... wght=400 --update-name-table`. Crimson Pro
declares no Reserved Font Name, so the instance keeps the family name. The
website serves the same file from `apps/web/public/fonts/`.
https://github.com/google/fonts/tree/f2bd09badbc763d8757951d52deec29da27e85fb/ofl/crimsonpro

Crimson Pro is licensed under SIL Open Font License 1.1. Keep its copyright and
full license when distributing it. The native copy of the license is stored in
`apps/native/assets/fonts/crimson-pro-license.json` and included in the bundled
Expo manifest through `extra.fontLicenses`. The website serves the same license
at `/fonts/CrimsonPro-OFL.txt`.

The PostScript name and Android filename stem are both
`CrimsonProRoman-Regular`. Use that name for native styles and the same TTF for
Skia's animated text. To change the weight, cut a new instance from the variable
file rather than setting `fontWeight`. Crimson Pro's x-height is smaller than
Exposure's (0.42 against 0.50 em), so titles read about 16% smaller at the same
point size.

The existing native-text fallback handles scripts or glyphs the font does not
cover, which is how Japanese and Korean titles render: Crimson Pro is a Latin
face and covers no CJK, as the trial face it replaces did not either. Crimson
Pro covers every Latin-script display string in all nine locale catalogues. The
face it replaced, `ExposureTrial-0`, was a 119-character trial cut that covered
69 of 77, so accented titles such as `Aufräumen`, `Coleções` and `Início` fell
back mid-word. Check coverage before swapping this font again.

This replacement changes the `expo-font` native configuration and EAS
fingerprint. Build new iOS and Android binaries before publishing updates that
use it; an OTA update cannot remove the old font from an installed binary.
Previously uploaded design previews need a separate design-sync run. The
RevenueCat paywall carries its own uploaded copy of the display font and is not
covered by this repository; change it in the dashboard.
