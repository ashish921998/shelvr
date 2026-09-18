# Display font

Native headings, animated text, the marketing site, and design-sync previews use
Faculty Glyphic Regular. Satoshi remains the body and control font. The widget
uses system fonts.

The unmodified `FacultyGlyphic-Regular.ttf` comes from Google Fonts at commit
`a60a77e14f28abd4ef243a1b5dfc48df0cec5205`, under `ofl/facultyglyphic/`:
https://github.com/google/fonts/tree/a60a77e14f28abd4ef243a1b5dfc48df0cec5205/ofl/facultyglyphic

Faculty Glyphic is licensed under SIL Open Font License 1.1. Keep its copyright
and full license when distributing the font. The native copy is stored in
`apps/native/assets/fonts/faculty-glyphic-license.json` and included in the bundled
Expo manifest through `extra.fontLicenses`. The website serves the same license
at `/fonts/FacultyGlyphic-OFL.txt`.

The PostScript name and Android filename stem are both `FacultyGlyphic-Regular`.
Use that name for native styles and the same TTF for Skia's animated text. The
existing native-text fallback handles scripts or glyphs the font does not cover.

This replacement changes the `expo-font` native configuration and EAS
fingerprint. Build new iOS and Android binaries before publishing updates that
use it; an OTA update cannot remove the old font from an installed binary.
Previously uploaded design previews need a separate design-sync run.
