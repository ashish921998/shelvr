import Foundation
import Testing
@testable import ShelvrKit

@MainActor @Test func upgradeRemovesOnlyExpoSearchCopiesAndConfirmsTheIndexBeforeForgettingIDs() async throws {
  let suite = "shelvr.legacy-search-test." + UUID().uuidString
  let defaults = try #require(UserDefaults(suiteName: suite))
  let catalogs = try #require(UserDefaults(suiteName: suite + ".expo"))
  let documents = FileManager.default.temporaryDirectory.appending(path: UUID().uuidString)
  defer {
    defaults.removePersistentDomain(forName: suite)
    catalogs.removePersistentDomain(forName: suite + ".expo")
    try? FileManager.default.removeItem(at: documents)
  }
  let thumbs = documents.appending(path: "app-intent-thumbs")
  try FileManager.default.createDirectory(at: thumbs, withIntermediateDirectories: true)
  try Data([1]).write(to: thumbs.appending(path: "fixture.jpg"))
  let otherFile = documents.appending(path: "keep.jpg")
  try Data([2]).write(to: otherFile)
  let ids = "shelvr.spotlight.indexedItemIds"
  defaults.set(["prior"], forKey: ids)
  catalogs.set(Data([0]), forKey: "dev.expo.appintents.entities.item")
  catalogs.set(Data([0]), forKey: "dev.expo.appintents.entities.space")
  catalogs.set(true, forKey: "dev.expo.appintents.index.stale.item")
  catalogs.set("keep", forKey: "unrelated")
  let cleanup = LegacySearchCleanup(defaults: defaults, catalogs: catalogs, documents: documents)
  await #expect(throws: URLError.self) {
    try await cleanup.run { _ in throw URLError(.timedOut) }
  }
  #expect(defaults.stringArray(forKey: ids) == ["prior"])
  #expect(catalogs.object(forKey: "dev.expo.appintents.entities.item") == nil)
  #expect(catalogs.object(forKey: "dev.expo.appintents.entities.space") == nil)
  #expect(catalogs.object(forKey: "dev.expo.appintents.index.stale.item") == nil)
  #expect(catalogs.string(forKey: "unrelated") == "keep")
  #expect(!FileManager.default.fileExists(atPath: thumbs.path))
  #expect(try Data(contentsOf: otherFile) == Data([2]))
  var domains: [String] = []
  try await cleanup.run { domains.append($0) }
  try await cleanup.run { domains.append($0) }
  #expect(domains == ["shelvr.item"])
  #expect(defaults.object(forKey: ids) == nil)
  defaults.set(["written-by-older-build"], forKey: ids)
  try await cleanup.run { domains.append($0) }
  #expect(domains == ["shelvr.item", "shelvr.item"])
}

@MainActor @Test func upgradeClearsAnInterruptedExpoIndexEvenWithoutARecordedIdentifierList() async throws {
  let suite = "shelvr.interrupted-search-test." + UUID().uuidString
  let defaults = try #require(UserDefaults(suiteName: suite))
  defer { defaults.removePersistentDomain(forName: suite) }
  let documents = FileManager.default.temporaryDirectory.appending(path: UUID().uuidString)
  let cleanup = LegacySearchCleanup(defaults: defaults, catalogs: defaults, documents: documents)
  var domains: [String] = []
  try await cleanup.run { domains.append($0) }
  #expect(domains == ["shelvr.item"])
}
