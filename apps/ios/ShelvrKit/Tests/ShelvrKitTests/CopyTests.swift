import Foundation
import Testing

@testable import ShelvrKit

struct CopyTests {
  static let locales = URL(filePath: #filePath)
    .deletingLastPathComponent().appending(path: "../../../../native/src/locales").standardized

  @Test(arguments: [
    (["en-US"], "en"),
    (["fr-CA"], "fr-CA"),
    (["fr-BE"], "fr"),
    (["pt-PT"], "pt-BR"),
    (["es-419"], "es"),
    (["zh-Hans-CN", "de-AT"], "de"),
    (["ja_JP"], "ja"),
    (["en-US-u-ca-gregory"], "en"),
    (["zh-Hant-TW"], "en"),
  ])
  func resolvesLikeTheExpoApp(tags: [String], locale: String) {
    #expect(Copy.resolve(tags) == locale)
  }

  @Test func fillsNamedValues() {
    let copy = Copy(locale: "en", messages: ["legal.consent": "Agree to %{terms} and %{privacy}."])
    #expect(copy("legal.consent", ["terms": "Terms", "privacy": "Privacy"]) == "Agree to Terms and Privacy.")
    #expect(copy("missing.key") == "missing.key")
  }

  @Test func everyCatalogTheAppShipsIsReadable() throws {
    for locale in Copy.supportedLocales {
      let data = try Data(contentsOf: Self.locales.appending(path: "\(locale).json"))
      let catalog = try #require(try JSONSerialization.jsonObject(with: data) as? [String: Any])
      #expect(catalog["account.apple"] is String, "\(locale) has no account.apple")
    }
  }

  @Test func everyKeyTheAppUsesIsInTheEnglishCatalog() throws {
    let english = try #require(
      try JSONSerialization.jsonObject(with: Data(contentsOf: Self.locales.appending(path: "en.json")))
        as? [String: Any])
    let app = Self.locales.appending(path: "../../../ios/Shelvr").standardized
    let files = try #require(FileManager.default.enumerator(at: app, includingPropertiesForKeys: nil))
      .compactMap { $0 as? URL }.filter { $0.pathExtension == "swift" }
    #expect(files.isEmpty == false)
    for file in files {
      let source = try String(contentsOf: file, encoding: .utf8)
      for match in source.matches(of: /copy\("([A-Za-z0-9_.]+)"/) {
        #expect(english[String(match.1)] != nil, "\(file.lastPathComponent) uses missing key \(match.1)")
      }
    }
  }
}

@Test func rendersPluralFormsFromTheShippedCatalogs() throws {
  let bundle = try #require(Bundle(url: CopyTests.locales))
  for locale in Copy.supportedLocales {
    let copy = Copy(bundle: bundle, preferredLanguages: [locale])
    let key = "spaces.saveCount"
    let forms = try #require(Copy.catalog(locale, in: bundle)[key]?.forms)
    for (count, base) in [(0, "other"), (1, "one"), (2, "other"), (1_000_000, "other")] {
      let form = switch locale {
      case "ja", "ko": "other"
      case "fr", "fr-CA", "pt-BR": count == 0 ? "one" : base
      default: base
      }
      let million = ["es", "es-MX", "fr", "fr-CA", "pt-BR"].contains(locale) && count == 1_000_000
      let expected = try #require(forms[million ? "many" : form])
      let formatted = count.formatted(.number.locale(Locale(identifier: locale)))
      #expect(copy(key, count: count) == expected.replacingOccurrences(of: "%{formattedCount}", with: formatted))
    }
  }
}

@Test func keepsIndianNumberGroupingWhenFallingBackToEnglish() throws {
  let copy = Copy(bundle: try #require(Bundle(url: CopyTests.locales)), preferredLanguages: ["hi-IN"])
  #expect(copy("spaces.saveCount", count: 1_234_567) == "12,34,567 saves")
}
