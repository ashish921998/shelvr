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
