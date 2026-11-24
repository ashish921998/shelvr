import Foundation

public enum SharedWebLink {
  public static func explicit(_ text: String) -> String? {
    guard let url = URL(string: text), let scheme = url.scheme?.lowercased(),
      scheme == "https" || scheme == "http", let host = url.host, !host.isEmpty
    else { return nil }
    return url.absoluteString
  }

  public static func first(in text: String, explicitLinks: [String] = []) -> String? {
    guard let range = text.range(of: #"https?://[^\s<>"]+"#,
      options: [.regularExpression, .caseInsensitive]) else { return nil }
    var link = String(text[range])
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
