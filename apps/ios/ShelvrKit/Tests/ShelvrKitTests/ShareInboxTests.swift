import Foundation
import Testing
import UniformTypeIdentifiers
@testable import ShelvrInbox

@MainActor
func withShareInbox(_ run: (ShareInbox) async throws -> Void) async throws {
  let inbox = ShareInbox(directory: FileManager.default.temporaryDirectory.appending(path: UUID().uuidString))
  defer { try? FileManager.default.removeItem(at: inbox.directory) }
  try inbox.activate("first")
  try await run(inbox)
}

@MainActor @Test func onlyPublishesCompleteBatchesAndKeepsRetryIdentifiers() async throws {
  try await withShareInbox { inbox in
    let stage = try inbox.stage(owner: "first")
    let share = InboxPayload(kind: .link, value: "https://example.com")
    #expect(try inbox.batches().isEmpty)
    try inbox.publish([share], in: stage)
    let ready = try #require(inbox.batches().first)
    let file = try #require(inbox.manifests(in: ready).first)
    #expect(try JSONDecoder().decode(InboxPayload.self, from: Data(contentsOf: file)).operationID == share.operationID)
    try inbox.activate("second")
    try inbox.prune(keeping: "second")
    #expect(try inbox.batches().isEmpty)
  }
}

@MainActor @Test func changingAccountsWhileSharingCannotPublishToTheNewAccount() async throws {
  try await withShareInbox { inbox in
    let stage = try inbox.stage(owner: "first")
    try inbox.activate(nil)
    try inbox.activate("second")
    #expect(throws: ShareInboxError.ownerChanged) {
      try inbox.publish([InboxPayload(kind: .link, value: "https://example.com")], in: stage)
    }
    #expect(try inbox.batches().isEmpty)
  }
}

@MainActor @Test func pruningKeepsAnExtensionThatHasJustCreatedItsStagingDirectory() async throws {
  try await withShareInbox { inbox in
    let stage = inbox.directory.appending(path: "unowned.staging")
    try FileManager.default.createDirectory(at: stage, withIntermediateDirectories: false)
    try inbox.prune(keeping: "first")
    #expect(FileManager.default.fileExists(atPath: stage.path))
  }
}

@MainActor @Test func sharesQueuedBeforeSignInArePrivateToTheFirstAccountAndClearedAtSignOut() async throws {
  try await withShareInbox { inbox in
    let old = try inbox.stage(owner: "first")
    try inbox.publish([InboxPayload(kind: .link, value: "https://example.com/previous")], in: old)
    try inbox.activate(nil)
    #expect(try inbox.batches().isEmpty)

    let stage = try inbox.stage(owner: nil)
    let incoming = InboxPayload(kind: .link, value: "https://example.com/pending")
    try inbox.publish([incoming], in: stage)
    try inbox.prune(keeping: nil)
    try inbox.activate(nil)
    #expect(try inbox.batches().count == 1)

    try inbox.activate("second")
    let failure = try #require(await inbox.drain(owner: "second") { delivery in
      #expect(delivery.operationID == incoming.operationID)
      throw CocoaError(.fileReadNoPermission)
    })
    try inbox.activate(nil)
    try inbox.activate("third")
    #expect(throws: ShareInboxError.ownerChanged) { try failure.share.discard() }
    #expect(try inbox.batches().isEmpty)
  }
}

@MainActor @Test func unsignedStagingCannotPublishAfterAnInterveningAccountSession() async throws {
  try await withShareInbox { inbox in
    try inbox.activate(nil)
    let stage = try inbox.stage(owner: nil)
    try inbox.activate("second")
    try inbox.activate(nil)
    #expect(throws: ShareInboxError.ownerChanged) {
      try inbox.publish([InboxPayload(kind: .link, value: "https://example.com")], in: stage)
    }
    #expect(try inbox.batches().isEmpty)
  }
}

@MainActor @Test func activationExcludesAnExistingDirectoryFromBackupAndPublishesItsOwner() async throws {
  try await withShareInbox { inbox in
    try inbox.activate(nil)
    let directoryPath = inbox.directory.path
    var directory = URL(filePath: directoryPath, directoryHint: .isDirectory)
    var values = URLResourceValues()
    values.isExcludedFromBackup = false
    try directory.setResourceValues(values)
    @Sendable func backupExcluded() -> Bool? {
      let fresh = URL(filePath: directoryPath, directoryHint: .isDirectory)
      return try? fresh.resourceValues(forKeys: [.isExcludedFromBackupKey]).isExcludedFromBackup
    }
    try await eventually { @Sendable in backupExcluded() == false }
    try inbox.activate("second")
    try await eventually { @Sendable in backupExcluded() == true }
    #expect(inbox.activeOwner == "second")
  }
}

@MainActor @Test func preservesTheOrderOfDoubleDigitAttachmentIndexes() async throws {
  try await withShareInbox { inbox in
    let stage = try inbox.stage(owner: "first")
    let shares = (0..<12).map { InboxPayload(kind: .link, value: "https://example.com/\($0)") }
    try inbox.publish(shares, in: stage)
    var received: [String] = []
    let refusal = try await inbox.drain(owner: "first") { received.append($0.operationID) }
    #expect(refusal == nil)
    #expect(received == shares.map(\.operationID))
    #expect(try inbox.batches().isEmpty)
  }
}

@Test func aURLAndItsCaptionInOneShareCreateOneLinkOperation() throws {
  let first = InboxPayload(kind: .link, value: "https://example.com/reel!")
  let incoming = ShareAttachment.payloads([.payload(first), .caption("Watch https://example.com/reel!"),
    .caption("Another: https://example.com/reel-other")])
  #expect(incoming.count == 2)
  #expect(incoming.first?.operationID == first.operationID)
}

@Test func aPlainCaptionInALinkShareDoesNotCreateAnExtraNote() {
  let link = InboxPayload(kind: .link, value: "https://example.com/reel")
  let result = ShareAttachment.payloads([.caption("Check this out"), .payload(link), .caption(" \n ")])
  #expect(result.map(\.operationID) == [link.operationID])
}

@Test func captionKeepsItsLongerExplicitURLAndUnsupportedURLAllowsImageFallback() {
  let shorter = "https://example.com/reel"
  let longer = shorter + "!"
  let result = ShareAttachment.payloads([.caption("Watch " + longer),
    .payload(InboxPayload(kind: .link, value: shorter)), .payload(InboxPayload(kind: .link, value: longer))])
  #expect(result.map(\.value) == [longer, shorter])
  #expect(ShareAttachment.webLink("file:///fixture.png") == nil)
}

@Test func aCaptionKeepsItsFirstLinkEvenWhenAnExplicitLinkOccursLater() {
  let other = "https://example.com/a"
  let explicit = InboxPayload(kind: .link, value: "https://example.com/b")
  let results = ShareAttachment.payloads([.caption("Watch \(other)! Then \(explicit.value)."), .payload(explicit)])
  #expect(results.map(\.value) == [other, explicit.value])
}

@Test func captionOnlySharesStillFindWebLinksWithoutAScheme() throws {
  for host in ["www.apple.com", "apple.com"] {
    let caption = "Try \(host)/maps!"
    let share = try #require(ShareAttachment.payloads([.caption(caption)]).first)
    let url = try #require(URL(string: share.value))
    #expect(url.host == host)
    #expect(url.path == "/maps")
  }
}

@MainActor @Test func usesTheImageWhenAProvidersURLRepresentationThrows() async throws {
  var attempted: [String] = []
  let value = try await ShareAttachment.firstAvailable(["url", "image"]) { type in
    attempted.append(type)
    if type == "url" { throw CocoaError(.fileReadCorruptFile) }
    return .payload(InboxPayload(kind: .image, value: "fixture.png"))
  }
  #expect(attempted == ["url", "image"])
  if case let .payload(payload) = value { #expect(payload.kind == .image) }
  else { Issue.record("Expected the image representation") }
}

@MainActor @Test func aRefusedPhotoDoesNotBlockAnotherShareAndCannotBeDiscardedByAnotherAccount() async throws {
  try await withShareInbox { inbox in
    let stage = try inbox.stage(owner: "first")
    let image = inbox.newImage(in: stage).payload
    let link = InboxPayload(kind: .link, value: "https://example.com")
    try inbox.publish([image, link], in: stage)
    let batch = try #require(inbox.batches().first)
    let original = try inbox.manifests(in: batch)
    var attempted: [String] = []
    let failure = try #require(await inbox.drain(owner: "first") { delivery in
      attempted.append(delivery.operationID)
      if case .image = delivery.content { throw CocoaError(.fileReadNoPermission) }
    })
    #expect(attempted == [image.operationID, link.operationID])
    #expect(try failure.share.delivery.get().operationID == image.operationID)
    #expect(try inbox.manifests(in: batch) == [original[0]])
    try inbox.activate("second")
    #expect(throws: ShareInboxError.ownerChanged) { try failure.share.discard() }
    #expect(try inbox.manifests(in: batch) == [original[0]])
  }
}

@MainActor @Test func aCorruptManifestCanStillBeDiscardedByItsOwner() async throws {
  try await withShareInbox { inbox in
    let stage = try inbox.stage(owner: "first")
    try inbox.publish([InboxPayload(kind: .link, value: "https://example.com")], in: stage)
    let batch = try #require(inbox.batches().first)
    let manifest = try #require(inbox.manifests(in: batch).first)
    try Data([0]).write(to: manifest)
    let failure = try #require(await inbox.drain(owner: "first") { _ in Issue.record("Corrupt share should never be sent") })
    try failure.share.discard()
    #expect(try inbox.manifests(in: batch).isEmpty)
  }
}

@MainActor @Test func utf8ItemProviderPlainTextProducesASaveableLink() async throws {
  let text = "Café tip https://example.com/coffee"
  let provider = NSItemProvider(item: Data(text.utf8) as NSData, typeIdentifier: UTType.plainText.identifier)
  let attachment = try #require(await ShareAttachment.loadLink(from: provider, type: .plainText))
  #expect(ShareAttachment.payloads([attachment]).map(\.value) == ["https://example.com/coffee"])
}

@MainActor @Test func malformedUtf8ItemProviderTextIsIgnored() async throws {
  let provider = NSItemProvider(item: Data([0xff]) as NSData, typeIdentifier: UTType.plainText.identifier)
  let attachment = try await ShareAttachment.loadLink(from: provider, type: .plainText)
  #expect(attachment == nil)
}

@MainActor @Test func urlItemProviderRetainsItsExplicitURL() async throws {
  let value = "https://example.com/coffee!"
  let url = try #require(URL(string: value))
  let provider = NSItemProvider(item: url as NSURL, typeIdentifier: UTType.url.identifier)
  let attachment = try #require(await ShareAttachment.loadLink(from: provider, type: .url))
  #expect(ShareAttachment.payloads([attachment]).map(\.value) == [value])
}

@MainActor @Test func discardingAFailedPhotoOnlyRemovesAnUnreferencedImage() async throws {
  try await withShareInbox { inbox in
    let stage = try inbox.stage(owner: "first")
    let image = inbox.newImage(in: stage)
    try Data([42]).write(to: image.file)
    let duplicate = InboxPayload(kind: .image, value: image.payload.value)
    let remaining = InboxPayload(kind: .link, value: "https://example.com/other-failure")
    try inbox.publish([image.payload, duplicate, remaining], in: stage)

    let batch = try #require(inbox.batches().first)
    let photo = batch.appending(path: image.payload.value)
    let first = try #require(await inbox.drain(owner: "first") { _ in throw CocoaError(.fileReadNoPermission) })
    try first.share.discard()
    #expect(FileManager.default.fileExists(atPath: photo.path))

    let second = try #require(await inbox.drain(owner: "first") { _ in throw CocoaError(.fileReadNoPermission) })
    try second.share.discard()
    #expect(!FileManager.default.fileExists(atPath: photo.path))
    #expect(try inbox.manifests(in: batch).count == 1)
  }
}
