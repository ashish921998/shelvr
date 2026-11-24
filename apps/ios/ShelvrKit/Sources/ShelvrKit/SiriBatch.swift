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

  public static func entityContent(kind: String, value: String?, title: String, photoLabel: String) -> String {
    kind == "image" ? photoLabel : value ?? title
  }
}
