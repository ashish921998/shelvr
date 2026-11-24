import Foundation
import ShelvrInbox
import Testing
@testable import ShelvrKit

@Test func siriRetryKeepsTheOriginalOperationAndSource() throws {
  let pending = InboxPayload(kind: .note, value: "test note", operationID: "siri:fixture", siri: true, spaceID: "chosen-folder")
  let saved = try JSONDecoder().decode(InboxPayload.self, from: JSONEncoder().encode(pending))
  #expect(saved.operationID == "siri:fixture")
  #expect(saved.kind == .note)
  #expect(saved.spaceID == "chosen-folder")
  #expect(saved.siri == true)
  let old = Data(#"{"kind":"link","value":"https://example.com","operationID":"share:old"}"#.utf8)
  let restored = try JSONDecoder().decode(InboxPayload.self, from: old)
  #expect(restored.siri == nil)
  #expect(restored.spaceID == nil)
}

@Test func captureCredentialsFollowTheAuthenticatedSessionSubject() throws {
  func jwt(_ claims: String) -> String {
    "header." + Data(claims.utf8).base64EncodedString().replacingOccurrences(of: "=", with: "") + ".signature"
  }
  #expect(JWT.claims(of: jwt(#"{"sub":"person|session","exp":2,"iat":1}"#))?.sub == "person|session")
  #expect(JWT.claims(of: jwt(#"{"exp":2,"iat":1}"#))?.sub == nil)
}

@MainActor @Test func rollsBackIssuedCredentialWhenKeychainRefusesIt() async {
  var revoked = 0
  await #expect(throws: AuthSessionError.sessionStorageUnavailable) {
    try await Backend.installSiri({ throw AuthSessionError.sessionStorageUnavailable }, revokeOnFailure: { revoked += 1 })
  }
  #expect(revoked == 1)
  try? await Backend.installSiri({}, revokeOnFailure: { revoked += 1 })
  #expect(revoked == 1)
}

@Test func partialSiriBatchPreservesTheFirstEntityAndEachOutcome() {
  var batch = SiriBatch()
  batch.accepted("queued:siri:one")
  batch.accepted("item-two")
  #expect(batch.firstID == "queued:siri:one")
  #expect(batch.queued == 1)
  #expect(batch.saved == 1)
  #expect(batch.failed(of: 3) == 1)
  #expect(batch.failed(of: 11) == 9)
}

@Test func stickerAndImageContextSurviveQueuedReplay() throws {
  let old = InboxPayload(kind: .image, value: "image-file", operationID: "siri:image", siri: true,
    spaceID: "chosen", context: "saved from the on-screen photo", sticker: true)
  let restored = try JSONDecoder().decode(InboxPayload.self, from: JSONEncoder().encode(old))
  #expect(restored.context == old.context)
  #expect(restored.sticker == true)
  #expect(restored.spaceID == "chosen")
}

@Test func noteCaptureLimitUsesTheServersUTF16Length() {
  #expect(SiriText.fitsCapture(String(repeating: "a", count: 20_000)))
  #expect(!SiriText.fitsCapture(String(repeating: "a", count: 20_001)))
  #expect(!SiriText.fitsCapture(String(repeating: "😀", count: 10_001)))
  #expect(SiriText.fitsLibrary(String(repeating: "a", count: 100_000)))
  #expect(!SiriText.fitsLibrary(String(repeating: "a", count: 100_001)))
  #expect(SiriText.captureRoute(String(repeating: "a", count: 20_000)) == .direct)
  #expect(SiriText.captureRoute(String(repeating: "😀", count: 10_001)) == .inbox)
  #expect(SiriText.captureRoute(String(repeating: "a", count: 100_000)) == .inbox)
  #expect(SiriText.captureRoute(String(repeating: "a", count: 100_001)) == .tooLong)
}

@Test func resolvedLinksKeepTheirURLAndPhotosKeepTheirPhotoLabel() {
  #expect(SiriText.entityContent(kind: "link", value: "https://example.com", title: "New title", photoLabel: "Photo") == "https://example.com")
  #expect(SiriText.entityContent(kind: "image", value: "file name", title: "New title", photoLabel: "Photo") == "Photo")
}

@MainActor @Test func copyingOneRetainedNoteRemovesOnlyItsManifestAfterTheCopySucceeds() async throws {
  try await withShareInbox { inbox in
    let stage = try inbox.stage(owner: "first")
    let second = InboxPayload(kind: .note, value: "second", siri: true)
    let first = InboxPayload(kind: .note, value: "first", siri: true)
    try inbox.publish([second, first], in: stage)

    let target = try #require(await inbox.drain(owner: "first") { _ in throw ShareInboxError.longNoteNeedsRecovery })
    #expect(try !target.share.copyAndRemoveNote(for: "first") { _ in false })
    var copied = ""
    #expect(try target.share.copyAndRemoveNote(for: "first") { copied = $0; return true })
    #expect(copied == "second")

    let remaining = try #require(await inbox.drain(owner: "first") { _ in throw ShareInboxError.longNoteNeedsRecovery })
    #expect(try remaining.share.delivery.get().operationID == first.operationID)
  }
}

@MainActor @Test func queuedSiriLookupRequiresExactOperationAndActiveOwner() async throws {
  try await withShareInbox { inbox in
    let stage = try inbox.stage(owner: "first")
    let note = InboxPayload(kind: .note, value: "fixture", operationID: "siri:lookup", siri: true)
    let share = InboxPayload(kind: .link, value: "https://example.com")
    try inbox.publish([note, share], in: stage)

    #expect(inbox.queuedSiriDelivery(operationID: note.operationID, owner: "first")?.operationID == note.operationID)
    #expect(inbox.queuedSiriDelivery(operationID: share.operationID, owner: "first") == nil)
    #expect(inbox.queuedSiriDelivery(operationID: note.operationID, owner: "other") == nil)
    try inbox.activate("second")
    #expect(inbox.queuedSiriDelivery(operationID: note.operationID, owner: "first") == nil)
  }
}


@Test func queuedSiriNoteUsesItsOwnBearerForTheFolderAndSaveRequests() async throws {
  let configuration = URLSessionConfiguration.ephemeral
  configuration.protocolClasses = [SiriNoteHTTPFixture.self]
  let transport = ConvexHTTPAuthTransport(deployment: URL(string: "https://fixture.convex.cloud")!,
    session: URLSession(configuration: configuration))
  let folder = try await transport.siriFolder("folder", authorization: "fixture-owner")
  #expect(folder == "folder")
  await #expect(throws: SaveFailure.proRequired) {
    try await transport.saveSiriNote(["text": "fixture", "spaceId": "folder", "operationId": "siri:fixture"],
      authorization: "fixture-owner")
  }
}

private final class SiriNoteHTTPFixture: URLProtocol, @unchecked Sendable {
  override class func canInit(with request: URLRequest) -> Bool { true }
  override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
  override func stopLoading() {}

  override func startLoading() {
    let url = request.url!
    #expect(request.httpMethod == "POST")
    #expect(request.value(forHTTPHeaderField: "Authorization") == "Bearer fixture-owner")
    let reply: (Int, String)
    switch url.path {
    case "/api/query": reply = (200, #"{"status":"success","value":{"_id":"folder"}}"#)
    case "/api/mutation": reply = (560, #"{"status":"error","errorMessage":"Pro required","errorData":{"code":"pro_required"}}"#)
    default:
      Issue.record("Unexpected Convex HTTP endpoint")
      reply = (404, #"{"status":"error"}"#)
    }
    let response = HTTPURLResponse(url: url, statusCode: reply.0, httpVersion: nil, headerFields: nil)!
    client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
    client?.urlProtocol(self, didLoad: Data(reply.1.utf8))
    client?.urlProtocolDidFinishLoading(self)
  }
}


@Test func ordinaryRichNotesKeepTheirWordsAndDoNotRepeatTheirHeading() throws {
  let url = try #require(URL(string: "https://example.com/article"))
  var heading = AttributedString("Read later")
  heading.link = url
  var body = AttributedString("Read later\nTry this ")
  var linked = AttributedString("restaurant")
  linked.link = url
  body.append(linked)
  body.append(AttributedString(" on Friday."))
  #expect(SiriText.pageLink(name: heading, content: body) == nil)
  #expect(SiriText.noteText(name: String(heading.characters), content: String(body.characters))
    == "Read later\nTry this restaurant on Friday.")
  #expect(SiriText.noteText(name: "Trip", content: "Trip planning starts Friday") == "Trip\nTrip planning starts Friday")
  #expect(SiriText.pageLink(name: heading, content: nil) == url)
  #expect(SiriText.pageLink(name: AttributedString("Article"), content: linked) == nil)
  #expect(SiriText.pageLink(name: AttributedString("restaurant"), content: linked) == url)
  #expect(SiriText.pageLink(name: AttributedString("Article"), content: AttributedString(url.absoluteString)) == nil)
}
