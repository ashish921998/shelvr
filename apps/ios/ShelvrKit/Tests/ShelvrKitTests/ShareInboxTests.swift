import Foundation
import Testing
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

@MainActor @Test func preservesTheOrderOfDoubleDigitAttachmentIndexes() async throws {
  try await withShareInbox { inbox in
    let stage = try inbox.stage(owner: "first")
    let shares = (0..<12).map { InboxPayload(kind: .link, value: "https://example.com/\($0)") }
    try inbox.publish(shares, in: stage)
    var received: [String] = []
    try await inbox.drain(owner: "first") { received.append($0.operationID) }
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
