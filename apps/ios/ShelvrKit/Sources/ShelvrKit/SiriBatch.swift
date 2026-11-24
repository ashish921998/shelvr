import Foundation

public struct SiriBatch: Sendable {
  public private(set) var firstID: String?
  public private(set) var saved = 0
  public private(set) var queued = 0

  public init() {}

  public mutating func accepted(_ id: String) {
    firstID = firstID ?? id
    if id.hasPrefix("queued:") { queued += 1 } else { saved += 1 }
  }

  public func failed(of total: Int) -> Int { total - saved - queued }
}

public enum SiriText {
  public enum CaptureRoute: Equatable { case direct, inbox, tooLong }

  public static func captureRoute(_ text: String) -> CaptureRoute {
    if fitsCapture(text) { return .direct }
    return fitsLibrary(text) ? .inbox : .tooLong
  }

  public static func fitsLibrary(_ text: String) -> Bool { text.utf16.count <= 100_000 }

  public static func fitsCapture(_ text: String) -> Bool { text.utf16.count <= 20_000 }

  public static func noteText(name: String, content: String?) -> String {
    let title = name.trimmingCharacters(in: .whitespacesAndNewlines)
    let body = content?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    if body.isEmpty { return title }
    let firstLine = body.prefix { !$0.isNewline }.trimmingCharacters(in: .whitespaces)
    if title.isEmpty || firstLine == title { return body }
    return title + "\n" + body
  }

  public static func pageLink(name: AttributedString, content: AttributedString?) -> URL? {
    let title = String(name.characters).trimmingCharacters(in: .whitespacesAndNewlines)
    if let content {
      let body = String(content.characters).trimmingCharacters(in: .whitespacesAndNewlines)
      if !body.isEmpty {
        if !body.contains(where: \.isWhitespace), let url = URL(string: body), isWebURL(url) { return url }
        if !title.isEmpty && body != title { return nil }
        if let link = wholeLink(content) { return link }
      }
    }
    return wholeLink(name)
  }

  private static func wholeLink(_ text: AttributedString) -> URL? {
    let runs = text.runs.filter {
      !String(text[$0.range].characters).trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }
    guard let link = runs.first?.link, isWebURL(link), runs.allSatisfy({ $0.link == link }) else { return nil }
    return link
  }

  private static func isWebURL(_ url: URL) -> Bool {
    ["https", "http"].contains(url.scheme?.lowercased()) && url.host()?.isEmpty == false
  }

  public static func entityContent(kind: String, value: String?, title: String, photoLabel: String) -> String {
    kind == "image" ? photoLabel : value ?? title
  }
}
