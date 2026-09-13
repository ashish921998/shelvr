# Native app localization

The locale contract is `apps/native/localization.config.json`: 12 App Store locale
codes map to nine bundled app catalogs (the four English markets share English).
The launch set is English, Japanese, Korean, French (France/Canada), German,
Spanish (Spain/Mexico), and Brazilian Portuguese. Other languages are deferred.
English is the fallback for unsupported device preferences. Regional preferences
use an available catalog in that language: for example, pt-PT uses pt-BR.

India uses English;
Bengali, Gujarati, Hindi, Kannada, Malayalam, Marathi, Odia, Punjabi, Tamil, Telugu
and Urdu catalogs are intentionally excluded. English (India) keeps regional
number/date formatting.

`expo-localization` reads the ordered device/per-app language preferences. Each
translated component calls `useAppLocale()` to subscribe to changes; `t()` reads
the current locale when invoked so callbacks and alerts cannot retain an old
language. No language-change remount discards an unsaved draft. System settings
provide the per-app language picker. Expo's config plugin declares supported
locales and enables RTL layout only when the active catalog set includes an RTL
language. These changes require a fresh native binary before OTA updates can
reach installs with the new fingerprint.

`src/locales/en.json` is the source catalog. Its full English strings are lookup
keys. The i18n-js separator is a reserved control character, so ordinary periods
in sentences are not interpreted as nested keys. Interpolation uses `%{name}`.
Use a complete sentence with named values; never concatenate translated fragments
around counts. Count labels use number-neutral wording and values are formatted
with `Intl.NumberFormat`. Dates and numbers preserve the full device/per-app region
tag even when several regions share a translation catalog.

Translate interface copy and preset names at creation time. Saved titles, tags,
notes, album names, and space names are user-owned and must be passed as values,
not translation keys. Onboarding survey answers retain stable identifiers.
Shelvr, Shelvr Pro, product names, URLs and support addresses stay unchanged.

After modifying the source, update every locale and run:

```sh
pnpm localization:generate
pnpm run check
```

The generator validates full key and placeholder parity before changing any
outputs, then emits the static Metro catalog imports and iOS permission resources
under `apps/native/locales/`. Do not hand-edit these generated outputs. Native
permission prompts use the same translations as the app catalog. Catalog tests
check completeness, protected brand names, untranslated sentences and resources.
The localization tests cover Hermes without `Intl.Locale`, ordered preferences,
supported regional variants, number formatting, callback freshness and draft
preservation.

Native text renders non-ASCII header content instead of the per-character Skia
morph, preserving shaping, bidi, combining marks and font fallback. Navigation
chevrons follow RTL; photo-swipe hint positions remain tied to the recognizer's
physical X axis. The widget receives translated fallback text in its snapshot,
and refreshes when app language changes. Its gallery name and description use
`WidgetLocalizations.xcstrings`, attached to the extension target by the local
Expo config plugin. Before its first snapshot it shows the
brand rather than English instructional copy.

## External localization surfaces

RevenueCat owns the actual purchase sheet and Customer Center copy. Their remotely
configured localizations and App Store product metadata are separate from the
bundled fallback/paywall/profile UI. Check that configuration before advertising
complete end-to-end translated purchase flows. Weekly push copy is generated into `convex/model/notificationTranslations.json`
from the same catalog. Device registration accepts an optional locale; older clients
continue to work, and previously registered devices without a locale retain the
legacy English payload. A language change updates the same token without
interrupting the account's notification session. Deploy the compatible backend
before releasing this client, which sends the new optional registration field.

Store screenshot images and marketing copy belong in `shelvr-notes`. Keep store
locale codes distinct from app locale codes using the manifest mapping. The
vibe-aso screenshot workflow uses real app captures, localized headings, script
fonts and fit checks. Existing source designs must be checked against the current
app before publication; screenshots with English UI inside a translated heading
must not be described as fully localized app captures.
