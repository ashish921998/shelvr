import Foundation

struct SignOutMarker: Sendable {
  enum State {
    case absent
    case pending
    case inaccessible
  }

  let url: URL

  var state: State {
    do {
      let attributes = try FileManager.default.attributesOfItem(atPath: url.path)
      return attributes[.type] as? FileAttributeType == .typeRegular ? .pending : .inaccessible
    } catch let error as CocoaError where error.code == .fileNoSuchFile || error.code == .fileReadNoSuchFile {
      return .absent
    } catch {
      return .inaccessible
    }
  }

  func record() throws {
    try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
    try Data().write(to: url, options: .atomic)
  }

  func clear() throws {
    do {
      try FileManager.default.removeItem(at: url)
    } catch let error as CocoaError where error.code == .fileNoSuchFile || error.code == .fileReadNoSuchFile {}
  }
}
