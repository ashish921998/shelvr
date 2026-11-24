import Foundation

public struct Copy: Sendable {
  public static let supportedLocales = [
    "en", "de", "es", "es-MX", "fr", "fr-CA", "ja", "ko", "pt-BR",
  ]

  public let locale: String
  struct Message: Sendable {
    let catalog: String
    let text: String?
    let forms: [String: String]
  }

  private let messages: [String: Message]
  private let numberLocale: Locale

  public init(bundle: Bundle = .main, preferredLanguages: [String] = Locale.preferredLanguages, formattingLocale: Locale = .current) {
    let selected = Self.resolve(preferredLanguages)
    locale = selected
    let language = selected.split(separator: "-").first.map(String.init) ?? selected
    let preferred = preferredLanguages.map { $0.replacingOccurrences(of: "_", with: "-") }
      .first { $0.split(separator: "-").first?.lowercased() == language }
    let region = preferredLanguages.lazy.compactMap { Locale(identifier: $0).region?.identifier }.first
    let fallback = selected == "en" ? region.map { "en-" + $0 } ?? selected : selected
    let identifier = preferred ?? fallback
    if Locale(identifier: identifier).region == nil, let region = formattingLocale.region?.identifier {
      numberLocale = Locale(identifier: identifier + "-" + region)
    } else { numberLocale = Locale(identifier: identifier) }
    let chain = ["en", language, selected].filter(Self.supportedLocales.contains)
    var visited = Set<String>()
    var loaded: [String: Message] = [:]
    for catalog in chain where visited.insert(catalog).inserted {
      loaded.merge(Self.catalog(catalog, in: bundle)) { _, localized in localized }
    }
    messages = loaded
  }

  init(locale: String, messages: [String: String]) {
    self.locale = locale
    self.numberLocale = Locale(identifier: locale)
    self.messages = messages.mapValues { Message(catalog: locale, text: $0, forms: [:]) }
  }

  public func callAsFunction(_ key: String, _ values: [String: String] = [:]) -> String {
    interpolate(messages[key]?.text ?? key, values)
  }

  public func callAsFunction(_ key: String, count: Int, _ values: [String: String] = [:]) -> String {
    guard let message = messages[key] else { return key }
    let language = String(message.catalog.prefix(2))
    let magnitude = count.magnitude
    let form: String
    switch language {
    case "ja", "ko": form = "other"
    default:
      if ["es", "fr", "pt"].contains(language), magnitude > 0, magnitude.isMultiple(of: 1_000_000) {
        form = "many"
      } else if magnitude == 1 || (magnitude == 0 && ["fr", "pt"].contains(language)) {
        form = "one"
      } else {
        form = "other"
      }
    }
    var arguments = values
    arguments["count"] = String(count)
    arguments["formattedCount"] = count.formatted(.number.locale(numberLocale))
    return interpolate(message.text ?? message.forms[form] ?? key, arguments)
  }

  private func interpolate(_ template: String, _ values: [String: String]) -> String {
    template.replacing(/(?:%\{|\{\{)([A-Za-z0-9_]+)\}\}?/) { token in
      let name = String(token.1)
      return name == "locale" ? locale : values[name] ?? String(token.0)
    }
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

  static func catalog(_ locale: String, in bundle: Bundle) -> [String: Message] {
    guard
      let url = bundle.url(forResource: locale, withExtension: "json"),
      let data = try? Data(contentsOf: url),
      let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
    else { return [:] }
    return object.compactMapValues { value in
      if let text = value as? String { return Message(catalog: locale, text: text, forms: [:]) }
      guard let forms = value as? [String: String] else { return nil }
      return Message(catalog: locale, text: nil, forms: forms)
    }
  }
}
