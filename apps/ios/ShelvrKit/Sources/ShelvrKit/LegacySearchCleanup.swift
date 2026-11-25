import Foundation

@MainActor public struct LegacySearchCleanup {
  private static let completed = "swift.legacySearchCleanup.v1"
  private static let indexedIDs = "shelvr.spotlight.indexedItemIds"
  private static let catalogKeys = ["item", "space"].flatMap {
    ["dev.expo.appintents.entities." + $0, "dev.expo.appintents.index.stale." + $0]
  }

  private let defaults: UserDefaults
  private let catalogs: UserDefaults
  private let thumbnails: URL

  public init(defaults: UserDefaults, catalogs: UserDefaults, documents: URL) {
    self.defaults = defaults
    self.catalogs = catalogs
    thumbnails = documents.appending(path: "app-intent-thumbs", directoryHint: .isDirectory)
  }

  public func run(removeDomain: (String) async throws -> Void) async throws {
    let files = FileManager.default
    let hasThumbnails = files.fileExists(atPath: thumbnails.path)
    guard !defaults.bool(forKey: Self.completed) || hasThumbnails ||
      defaults.object(forKey: Self.indexedIDs) != nil ||
      Self.catalogKeys.contains(where: { catalogs.object(forKey: $0) != nil }) else { return }

    defaults.removeObject(forKey: Self.completed)
    Self.catalogKeys.forEach(catalogs.removeObject(forKey:))
    let thumbnailResult = Result { if hasThumbnails { try files.removeItem(at: thumbnails) } }
    try await removeDomain("shelvr.item")
    try Task.checkCancellation()
    defaults.removeObject(forKey: Self.indexedIDs)
    try thumbnailResult.get()
    defaults.set(true, forKey: Self.completed)
  }
}
