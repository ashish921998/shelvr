import Foundation

public enum SharedWebLink {
  private static let detector = try? NSDataDetector(types: NSTextCheckingResult.CheckingType.link.rawValue)
  public static func explicit(_ text: String) -> String? {
    guard let url = URL(string: text), let scheme = url.scheme?.lowercased(),
      scheme == "https" || scheme == "http", let host = url.host, !host.isEmpty
    else { return nil }
    return url.absoluteString
  }

  public static func first(in text: String, requiringScheme: Bool = false, explicitLinks: [String] = []) -> String? {
    let wholeText = NSRange(text.startIndex..., in: text)
    guard let match = detector?.matches(in: text, range: wholeText).first(where: { match in
      guard let range = Range(match.range, in: text),
        let url = match.url, explicit(url.absoluteString) != nil else { return false }
      return !requiringScheme || explicit(String(text[range])) != nil
    }), let range = Range(match.range, in: text), let url = match.url else { return nil }
    var link = url.absoluteString
    trimPunctuation(&link)
    if let provided = explicitLinks.filter({
      $0.hasPrefix(link) && text[range.lowerBound...].hasPrefix($0)
    }).max(by: { $0.count < $1.count }) { return provided }
    return explicit(link)
  }

  private static func trimPunctuation(_ link: inout String) {
    while let last = link.last {
      if ".,;:!?'".contains(last) {
        link.removeLast()
      } else if (last == ")" || last == "]"),
        link.filter({ $0 == last }).count > link.filter({ $0 == (last == ")" ? "(" : "[") }).count {
        link.removeLast()
      } else { return }
    }
  }
}
