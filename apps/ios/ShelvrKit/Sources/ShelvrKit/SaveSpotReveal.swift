import Foundation

public enum SaveSpotReveal: Equatable, Sendable {
  case finding, map
  case spots(String, [EditablePlace])

  public static func result(save: LibrarySave?, loaded: Bool, waited: TimeInterval, readyFor: TimeInterval) -> Self {
    guard let save else { return loaded || waited >= 25 ? .map : .finding }
    if save.status == "failed" || save.status == "unavailable" { return .map }
    guard save.status == "ready" else { return waited >= 25 ? .map : .finding }
    let pins = (save.placePins ?? []).filter { $0.lat != nil && $0.lng != nil && !address($0.name) }
    let named = pins.compactMap(\.city)
    var counts = [String: Int]()
    named.forEach { counts[key($0), default: 0] += 1 }
    let city = named.first { counts[key($0)] == counts.values.max() } ?? save.cities?.first
    if let city {
      let single = (save.cities ?? []).count <= 1
      let here = pins.filter { pin in pin.city.map { key($0) == key(city) } ?? single }
      if !here.isEmpty { return .spots(city, here) }
    }
    return (save.cities ?? []).isEmpty || readyFor >= 10 ? .map : .finding
  }

  private static func key(_ value: String) -> String {
    value.split(whereSeparator: \.isWhitespace).joined(separator: " ").lowercased()
  }

  private static func address(_ name: String) -> Bool {
    let words = name.decomposedStringWithCompatibilityMapping.folding(options: .diacriticInsensitive, locale: nil)
      .lowercased().filter { !"'’ʼ".contains($0) }.split { !$0.isLetter && !$0.isNumber }.map(String.init)
    guard let first = words.first, let last = words.last, !["burger", "burgers", "cafe", "bar", "restaurant", "bakery"].contains(last) else { return false }
    let prefixes = ["calle", "rue", "via", "strasse"]
    let suffixes = ["street", "st", "road", "rd", "avenue", "ave", "lane", "ln", "boulevard", "blvd", "drive", "dr"]
    let number = name.range(of: "^#?[0-9]", options: .regularExpression) != nil
    return number && words.contains { prefixes.contains($0) || suffixes.contains($0) } || words.count > 2 && prefixes.contains(first)
  }
}
