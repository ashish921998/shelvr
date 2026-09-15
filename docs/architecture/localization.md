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

`src/locales/en.json` is the source catalog. Stable semantic identifiers such as
`spaces.saveCount` are lookup keys; English copy is a value and can change without
renaming a key. The runtime expands these identifiers into the normal i18n-js
namespace tree. The generator emits `src/locales/message-types.ts` from English:
`t()` accepts only known keys and requires their named interpolation parameters.
Arrays and maps of dynamic UI keys must use `TextMessageKey` or literal types;
never cast an arbitrary string into a key.

The generated catalog registry also declares `SupportedLocale`. The resolver and
app locale hooks return that union, and RevenueCat's exhaustive mapping must be
updated when a new app catalog is added. Number formatters are created only for
numeric interpolation and reused in a bounded cache keyed by the full formatting
locale, including numbering extensions.

Use complete sentences with named `%{values}`; never concatenate translated
fragments around counts. Plural messages contain the CLDR cardinal categories
required by their locale (`one`/`other`, plus `many` where applicable; Japanese
and Korean use `other`). App and notification delivery share the `make-plural`
rules in `convex/model/localization.ts`, without requiring `Intl.PluralRules`
on Hermes. Pass numeric `count` to `t()`; use `%{formattedCount}` inside every
plural variant so selection uses the number and interpolation uses regional
number formatting. Other numbers are formatted automatically. Dates and numbers
preserve the full device/per-app region, including English (India).

`localizeError()` has an explicit mapping for recognized legacy backend errors.
That boundary stays independent of editable English UI copy. Unknown server
messages use a generic translated fallback and never expose server details.

Translate interface copy when rendering. Onboarding stores stable preset identities
through language changes and resolves names when passing the creation payload. Saved titles, tags,
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
check completeness, CLDR categories, protected brand names, untranslated sentences
and resources. A generator `--check` run in the tests verifies committed generated
outputs are reproducible. Source checks inspect visible JSX text, custom label
props, navigation option titles and alert copy. These checks complement typed keys;
they do not prove that every user-facing string or translation is correct.
The localization tests cover Hermes without `Intl.Locale`, ordered preferences,
supported regional variants, number formatting, callback freshness and draft
preservation.

Notification delivery interpolates exactly one `%{formattedCount}` value. The
generator rejects digest variants with missing, repeated or additional placeholders
before writing any resources; richer notification templates require updating that
delivery contract first.

Native text renders joining scripts, combining marks, emoji and glyphs missing
from the display font. Covered Latin text and ordinary punctuation retain the
Skia morph. The glyph component unmounts when native shaping takes over, so it
cannot animate stale letters when the next title switches back to Latin. Navigation
chevrons follow RTL; photo-swipe hint positions remain tied to the recognizer's
physical X axis. The widget receives translated fallback text in its snapshot,
and refreshes when app language changes. Its gallery name and description use
`WidgetLocalizations.xcstrings`, attached to the extension target by the local
Expo config plugin. Before its first snapshot it shows the
brand rather than English instructional copy.

## External localization surfaces

RevenueCat owns the actual purchase sheet and Customer Center copy. Their remotely
configured localizations and App Store product metadata are separate from the
bundled fallback/paywall/profile UI. The SDK is configured with the resolved app
locale, and `overridePreferredLocale()` refreshes it before every paywall or
Customer Center presentation. A failed sync is reported and follows the existing
unavailable/fallback path. This changes UI language only; prices and currency
remain store-provided. Check the remote configuration and sandbox purchase flow
before advertising complete end-to-end translated purchases. Weekly push copy is generated into `convex/model/notificationTranslations.json`
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

## Review and release status

The launch catalogs are AI-generated drafts with automated contract checks and AI
copy corrections. Native-speaker review is still outstanding. Passing tests is
not evidence of idiomatic language, correct terminology, or visual fit on a device.
Review the nine app catalogs in their screen context and the twelve store locales
before release, prioritizing onboarding, purchase/account text, permission prompts,
notification copy and screenshot headings. Review handoff CSVs and screenshot
planning assets belong in `shelvr-notes/store-assets/localization/`.

Store listing text has been staged separately in the approved App Store 1.0.3
draft. RevenueCat paywall translations are saved as an unpublished draft; Customer
Center already has populated base-language translations for the launch languages.
Publication, native-speaker review, localized screenshots, sandbox purchases and
native archive/device QA remain release steps. A JavaScript bundle export is not
a signed native build.
