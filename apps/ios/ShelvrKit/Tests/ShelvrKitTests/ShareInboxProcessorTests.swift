import ConvexMobile
import Foundation
import Synchronization
@testable import ShelvrInbox
import Testing
@testable import ShelvrKit

@MainActor private final class RecordingShareSaver: ShareSaver {
  var userID: String? = "first"
  let photoClient = RecordingPhotoMutations()
  var sentLinks: [String] = []
  var refuseLink = false

  func saveLink(_ url: String, operationID: String, source: SaveSource, checkpoint: () throws -> Void) throws {
    try checkpoint()
    if refuseLink { throw ClientError.ConvexError(data: #"{"code":"pro_required"}"#) }
    #expect(source == .shareExtension)
    sentLinks.append(url)
  }

  func savePhoto(_ photo: ImportPhoto, operationID: String, source: SaveSource, checkpoint: () throws -> Void) async throws -> String {
    try await photo.save(using: photoClient, operationID: operationID, source: source, checkpoint: checkpoint) { request, _ in
      self.userID = "second"
      let url = try #require(request.url)
      let response = try #require(HTTPURLResponse(url: url, statusCode: 200, httpVersion: nil, headerFields: nil))
      return (Data(#"{"storageId":"uploaded"}"#.utf8), response)
    }
  }
}

private final class RecordingPhotoMutations: PhotoMutationClient {
  private let calls = Mutex<[String]>([])
  var recorded: [String] { calls.withLock { $0 } }

  func mutation<T: Decodable>(_ name: String, with args: [String: ConvexEncodable?]?) async throws -> T {
    calls.withLock { $0.append(name) }
    #expect(name == "items:beginImageImport")
    return try JSONDecoder().decode(T.self, from: Data(#"{"kind":"upload","uploadUrl":"https://example.com/photo"}"#.utf8))
  }
}

@MainActor @Test func accountSwitchDuringUploadStopsBeforeAttachAndKeepsTheManifest() async throws {
  try await withShareInbox { inbox in
    let stage = try inbox.stage(owner: "first")
    let stagedImage = inbox.newImage(in: stage)
    let png = try #require(Data(base64Encoded: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9XEAAAAASUVORK5CYII="))
    try png.write(to: stagedImage.file)
    try inbox.publish([stagedImage.payload], in: stage)
    let saver = RecordingShareSaver()
    let processor = ShareInboxProcessor(inbox: inbox, saver: saver)
    await #expect(throws: ShareInboxError.ownerChanged) { _ = try await processor.drain(owner: "first") }
    #expect(saver.photoClient.recorded == ["items:beginImageImport"])
    let batch = try #require(inbox.batches().first)
    #expect(try inbox.manifests(in: batch).count == 1)
  }
}

@MainActor @Test func processorOnlySendsCurrentOwnerSharesAndUsesLinkFailureCopy() async throws {
  try await withShareInbox { inbox in
    try inbox.activate("second")
    let otherStage = try inbox.stage(owner: "second")
    try inbox.publish([InboxPayload(kind: .link, value: "https://example.com/other")], in: otherStage)
    try inbox.activate("first")
    let stage = try inbox.stage(owner: "first")
    let link = InboxPayload(kind: .link, value: "https://example.com/first")
    try inbox.publish([link], in: stage)

    let saver = RecordingShareSaver()
    let processor = ShareInboxProcessor(inbox: inbox, saver: saver)
    saver.refuseLink = true
    let refusal = try #require(await processor.drain(owner: "first"))
    #expect(refusal.copyKey == "freePlan.leftBody")
    #expect(try refusal.share?.delivery.get().operationID == link.operationID)

    saver.refuseLink = false
    #expect(try await processor.drain(owner: "first") == nil)
    #expect(saver.sentLinks == [link.value])
    #expect(try inbox.batches().isEmpty)
  }
}

@MainActor @Test func simultaneousBackendSignInsOnlyReachTheTransportOnce() async throws {
  let gate = Gate()
  let transport = FakeTransport([.respond(SignInResponse())], gate: gate)
  let session = AuthSession(transport: transport, vault: MemoryVault())
  let environment = try AppEnvironment(variant: .development, convexURL: URL(string: "http://127.0.0.1:1")!)
  let backend = Backend(environment: environment, session: session)
  await backend.start()
  #expect(backend.status == .signedOut)

  let first = Task { try await backend.signIn(.anonymous) }
  defer { gate.open() }
  try await eventually { @Sendable in transport.requests.count == 1 }
  await #expect(throws: AuthSessionError.signInRefused) { try await backend.signIn(.anonymous) }
  #expect(transport.requests.count == 1)
  gate.open()
  await #expect(throws: AuthSessionError.signInRefused) { try await first.value }
  #expect(backend.userID == nil)
}
