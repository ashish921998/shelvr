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
  private let caches: URL

  public init(defaults: UserDefaults, catalogs: UserDefaults, documents: URL, caches: URL) {
    self.caches = caches
    self.defaults = defaults
    self.catalogs = catalogs
    thumbnails = documents.appending(path: "app-intent-thumbs", directoryHint: .isDirectory)
  }

  private func stagedDownloads() throws -> [URL] {
    let files = FileManager.default
    guard files.fileExists(atPath: caches.path) else { return [] }
    let entries = try files.contentsOfDirectory(at: caches, includingPropertiesForKeys: [.isRegularFileKey, .isSymbolicLinkKey])
    return try entries.filter { url in
      guard url.lastPathComponent.wholeMatch(of: /app-intent-download-[A-Za-z0-9_-]+\.jpg/) != nil else { return false }
      let values = try url.resourceValues(forKeys: [.isRegularFileKey, .isSymbolicLinkKey])
      return values.isRegularFile == true && values.isSymbolicLink != true
    }
  }

  public func run(removeDomain: (String) async throws -> Void) async throws {
    let files = FileManager.default
    let hasThumbnails = files.fileExists(atPath: thumbnails.path)
    let staged = Result { try stagedDownloads() }
    guard !defaults.bool(forKey: Self.completed) || hasThumbnails || (try? staged.get().isEmpty) != true ||
      defaults.object(forKey: Self.indexedIDs) != nil ||
      Self.catalogKeys.contains(where: { catalogs.object(forKey: $0) != nil }) else { return }

    defaults.removeObject(forKey: Self.completed)
    Self.catalogKeys.forEach(catalogs.removeObject(forKey:))
    let thumbnailResult = Result { if hasThumbnails { try files.removeItem(at: thumbnails) } }
    let downloadResult = Result { for url in try staged.get() { try files.removeItem(at: url) } }
    try await removeDomain("shelvr.item")
    try Task.checkCancellation()
    defaults.removeObject(forKey: Self.indexedIDs)
    try thumbnailResult.get()
    try downloadResult.get()
    defaults.set(true, forKey: Self.completed)
  }
}
