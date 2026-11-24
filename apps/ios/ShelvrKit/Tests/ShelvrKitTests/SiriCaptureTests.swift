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
}

@Test func resolvedLinksKeepTheirURLAndPhotosKeepTheirPhotoLabel() {
  #expect(SiriText.entityContent(kind: "link", value: "https://example.com", title: "New title", photoLabel: "Photo") == "https://example.com")
  #expect(SiriText.entityContent(kind: "image", value: "file name", title: "New title", photoLabel: "Photo") == "Photo")
}

@Test func copyingOneRetainedNoteRemovesOnlyItsManifestAfterTheCopySucceeds() throws {
  let dir = FileManager.default.temporaryDirectory.appending(path: UUID().uuidString)
  let inbox = ShareInbox(directory: dir)
  defer { try? FileManager.default.removeItem(at: dir) }
  try inbox.activate("owner")
  let stage = try inbox.stage(owner: "owner")
  try inbox.publish([InboxPayload(kind: .note, value: "first", siri: true), InboxPayload(kind: .note, value: "second", siri: true)], in: stage)
  let batch = try #require(inbox.batches().first)
  let files = try inbox.manifests(in: batch)
  #expect(try !inbox.copyAndRemoveNote(files[1], owner: "owner") { _ in false })
  var copied = ""
  #expect(try inbox.copyAndRemoveNote(files[1], owner: "owner") { copied = $0; return true })
  #expect(copied == "second")
  #expect(try inbox.manifests(in: batch) == [files[0]])
}
