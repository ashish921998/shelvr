import Foundation
import ShelvrInbox
import Testing

@Test func onlyPublishesCompleteBatchesAndKeepsRetryIdentifiers() throws {
  let inbox = ShareInbox(directory: FileManager.default.temporaryDirectory.appending(path: UUID().uuidString))
  defer { try? FileManager.default.removeItem(at: inbox.directory) }
  try inbox.activate("first")
  let stage = try inbox.stage(owner: "first")
  let share = InboxPayload(kind: .link, value: "https://example.com")
  #expect(try inbox.batches().isEmpty)
  try inbox.publish([share], in: stage)
  let ready = try #require(inbox.batches().first)
  let file = try #require(inbox.manifests(in: ready).first)
  #expect(try JSONDecoder().decode(InboxPayload.self, from: Data(contentsOf: file)).operationID == share.operationID)
  try inbox.activate("second")
  #expect(try inbox.batches().isEmpty)
}

@Test func changingAccountsWhileSharingCannotPublishToTheNewAccount() throws {
  let inbox = ShareInbox(directory: FileManager.default.temporaryDirectory.appending(path: UUID().uuidString))
  defer { try? FileManager.default.removeItem(at: inbox.directory) }
  try inbox.activate("first")
  let stage = try inbox.stage(owner: "first")
  try inbox.activate(nil)
  try inbox.activate("second")
  #expect(throws: CocoaError.self) {
    try inbox.publish([InboxPayload(kind: .link, value: "https://example.com")], in: stage)
  }
  #expect(try inbox.batches().isEmpty)
}

@Test func activationKeepsAnExtensionThatHasJustCreatedItsStagingDirectory() throws {
  let inbox = ShareInbox(directory: FileManager.default.temporaryDirectory.appending(path: UUID().uuidString))
  defer { try? FileManager.default.removeItem(at: inbox.directory) }
  try inbox.activate("first")
  let stage = inbox.directory.appending(path: "unowned.staging")
  try FileManager.default.createDirectory(at: stage, withIntermediateDirectories: false)
  try inbox.activate("first")
  #expect(FileManager.default.fileExists(atPath: stage.path))
}

@Test func preservesTheOrderOfDoubleDigitAttachmentIndexes() throws {
  let inbox = ShareInbox(directory: FileManager.default.temporaryDirectory.appending(path: UUID().uuidString))
  defer { try? FileManager.default.removeItem(at: inbox.directory) }
  try inbox.activate("first")
  let stage = try inbox.stage(owner: "first")
  try inbox.publish((0..<12).map { InboxPayload(kind: .link, value: "https://example.com/\($0)") }, in: stage)
  let batch = try #require(inbox.batches().first)
  #expect(try inbox.manifests(in: batch).map(\.lastPathComponent) == (0..<12).map { "\($0).json" })
}

@Test func aURLAndItsCaptionInOneShareCreateOneLinkOperation() throws {
  let inbox = ShareInbox(directory: FileManager.default.temporaryDirectory.appending(path: UUID().uuidString))
  defer { try? FileManager.default.removeItem(at: inbox.directory) }
  try inbox.activate("first")
  let stage = try inbox.stage(owner: "first")
  let first = InboxPayload(kind: .link, value: "https://example.com/reel!")
  let incoming = ShareAttachment.payloads([.payload(first), .caption("Watch https://example.com/reel!"),
    .caption("Another: https://example.com/reel-other")])
  try inbox.publish(incoming, in: stage)
  let batch = try #require(inbox.batches().first)
  let manifests = try inbox.manifests(in: batch)
  #expect(manifests.count == 2)
  let restored = try JSONDecoder().decode(InboxPayload.self, from: Data(contentsOf: manifests[0]))
  #expect(restored.operationID == first.operationID)
}

@Test func captionKeepsItsLongerExplicitURLAndUnsupportedURLAllowsImageFallback() {
  let shorter = "https://example.com/reel"
  let longer = shorter + "!"
  let result = ShareAttachment.payloads([.caption("Watch " + longer),
    .payload(InboxPayload(kind: .link, value: shorter)), .payload(InboxPayload(kind: .link, value: longer))])
  #expect(result.map(\.value) == [longer, shorter, longer])
  #expect(ShareAttachment.webLink("file:///fixture.png") == nil)
}

@MainActor @Test func usesTheImageWhenAProvidersURLRepresentationThrows() async throws {
  var attempted: [String] = []
  let value = try await ShareAttachment.firstAvailable(["url", "image"]) { type in
    attempted.append(type)
    if type == "url" { throw CocoaError(.fileReadCorruptFile) }
    return .payload(InboxPayload(kind: .image, value: "fixture.png"))
  }
  #expect(attempted == ["url","image"])
  if case let .payload(payload) = value { #expect(payload.kind == .image) }
  else { Issue.record("Expected the image representation") }
}

@MainActor @Test func aRefusedPhotoDoesNotBlockAnotherShare() async throws {
  let inbox = ShareInbox(directory: FileManager.default.temporaryDirectory.appending(path: UUID().uuidString))
  defer { try? FileManager.default.removeItem(at: inbox.directory) }
  try inbox.activate("first")
  let stage = try inbox.stage(owner: "first")
  try inbox.publish([InboxPayload(kind: .image, value: "photo"), InboxPayload(kind: .link, value: "https://example.com")], in: stage)
  let batch = try #require(inbox.batches().first)
  let original = try inbox.manifests(in: batch)
  var attempted: [URL] = []
  let failure = try await inbox.drain(batch, owner: "first") { file in
    attempted.append(file)
    if file == original[0] { throw CocoaError(.fileReadNoPermission) }
    return true
  }
  #expect(attempted == original)
  #expect(failure?.file == original[0])
  #expect(try inbox.manifests(in: batch) == [original[0]])
}
