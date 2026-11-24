import Foundation

public struct Copy: Sendable {
  public static let supportedLocales = [
    "en", "de", "es", "es-MX", "fr", "fr-CA", "ja", "ko", "pt-BR",
  ]

  public let locale: String
  private let messages: [String: String]

  public init(bundle: Bundle = .main, preferredLanguages: [String] = Locale.preferredLanguages) {
    let locale = Self.resolve(preferredLanguages)
    let english = Self.catalog("en", in: bundle)
    self.init(
      locale: locale,
      messages: english.merging(locale == "en" ? [:] : Self.catalog(locale, in: bundle)) { $1 })
  }

  init(locale: String, messages: [String: String]) {
    self.locale = locale
    self.messages = messages
  }

  public func callAsFunction(_ key: String, _ values: [String: String] = [:]) -> String {
    values.reduce(messages[key] ?? key) {
      $0.replacingOccurrences(of: "%{\($1.key)}", with: $1.value)
    }
  }

  public func count(_ key: String, _ n: Int) -> String {
    let language = locale.split(separator: "-").first ?? ""
    let one = !["ja", "ko"].contains(language) && (n == 1 || (n == 0 && ["fr", "pt"].contains(language)))
    let form = one && messages[key + ".one"] != nil ? "one" : "other"
    let count = n.formatted(.number.locale(Locale(identifier: locale)))
    return self(key + "." + form, ["formattedCount": count, "count": count])
  }

  static func resolve(_ languageTags: [String]) -> String {
    for tag in languageTags {
      let base = tag.replacing("_", with: "-").split(separator: /-[uUxX]-/).first.map(String.init) ?? ""
      let language = base.split(separator: "-").first.map(String.init) ?? ""
      let match = { (candidate: String) in
        supportedLocales.first { $0.caseInsensitiveCompare(candidate) == .orderedSame }
      }
      if let exact = match(base) ?? match(language) { return exact }
      if let regional = supportedLocales.first(where: { $0.lowercased().hasPrefix("\(language.lowercased())-") }) {
        return regional
      }
    }
    return "en"
  }

  static func catalog(_ locale: String, in bundle: Bundle) -> [String: String] {
    guard
      let url = bundle.url(forResource: locale, withExtension: "json"),
      let data = try? Data(contentsOf: url),
      let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
    else { return [:] }
    var messages = object.compactMapValues { $0 as? String }
    for (key, value) in object {
      if let forms = value as? [String: String] {
        for (form, text) in forms { messages[key + "." + form] = text }
      }
    }
    return messages
  }
}
