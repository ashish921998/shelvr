# Display font

Native headings, animated text, the marketing site, and design-sync previews use
Spectral Regular. Satoshi remains the body and control font. The widget uses
system fonts.

The unmodified `Spectral-Regular.ttf` comes from Google Fonts at commit
`f2bd09badbc763d8757951d52deec29da27e85fb`, under `ofl/spectral/`:
https://github.com/google/fonts/tree/f2bd09badbc763d8757951d52deec29da27e85fb/ofl/spectral

Spectral is licensed under SIL Open Font License 1.1. Keep its copyright and
full license when distributing the font. The native copy is stored in
`apps/native/assets/fonts/spectral-license.json` and included in the bundled
Expo manifest through `extra.fontLicenses`. The website serves the same license
at `/fonts/Spectral-OFL.txt`.

The PostScript name and Android filename stem are both `Spectral-Regular`.
Use that name for native styles and the same TTF for Skia's animated text. The
existing native-text fallback handles scripts or glyphs the font does not cover,
which is how Japanese and Korean titles render: Spectral is a Latin face and
covers no CJK, as the trial face it replaces did not either.

Spectral covers every display string in all nine locale catalogues. The face it
replaced, `ExposureTrial-0`, was a 119-character trial cut that covered 69 of
77, so accented titles such as `Aufräumen`, `Coleções` and `Início` fell back
mid-word. Check coverage before swapping this font again.

This replacement changes the `expo-font` native configuration and EAS
fingerprint. Build new iOS and Android binaries before publishing updates that
use it; an OTA update cannot remove the old font from an installed binary.
Previously uploaded design previews need a separate design-sync run. The
RevenueCat paywall carries its own uploaded copy of the display font and is not
covered by this repository; change it in the dashboard.
