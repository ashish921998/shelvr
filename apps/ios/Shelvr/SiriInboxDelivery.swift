import Foundation
import ShelvrInbox
import ShelvrKit

@MainActor
struct SiriInboxDelivery {
  let backend: Backend

  func send(_ delivery: PendingShare.Delivery, owner: String, checkpoint: () throws -> Void) async throws {
    switch delivery.content {
    case .link(let url):
      try await withToken(owner: owner, checkpoint: checkpoint) { credentials in
        _ = try await ShelvrCapture.save(kind: "link", text: nil, url: url,
          spaceId: delivery.spaceID, operationId: delivery.operationID, credentials: credentials)
      }
    case .note(let text):
      if !SiriText.fitsLibrary(text) { throw ShareInboxError.longNoteNeedsRecovery }
      if !SiriText.fitsCapture(text) {
        try await backend.saveQueuedSiriNote(text, operationID: delivery.operationID, spaceID: delivery.spaceID,
          owner: owner, checkpoint: checkpoint)
      } else {
        try await withToken(owner: owner, checkpoint: checkpoint) { credentials in
          _ = try await ShelvrCapture.save(kind: "note", text: text, url: nil,
            spaceId: delivery.spaceID, operationId: delivery.operationID, credentials: credentials)
        }
      }
    case .image(let file):
      let photo = try await Task.detached { try ImportPhoto(Data(contentsOf: file, options: .mappedIfSafe)) }.value
      try await withToken(owner: owner, checkpoint: checkpoint) { credentials in
        _ = try await ShelvrCapture.saveImage(photo.data, contentType: photo.contentType, aspectRatio: photo.aspectRatio,
          isSticker: delivery.sticker, spaceId: delivery.spaceID, context: delivery.context,
          operationId: delivery.operationID, credentials: credentials)
      }
    }
  }

  private func withToken(owner: String, checkpoint: () throws -> Void,
    perform: (ShelvrCapture.Credentials) async throws -> Void) async throws {
    try checkpoint()
    try await backend.prepareSiri(owner: owner)
    try checkpoint()
    guard let credential = SiriCredential.current(), credential.owner == owner else { throw ShelvrCapture.Failure.signedOut }
    do { try await perform(.init(siteUrl: credential.siteURL, token: credential.token)) }
    catch ShelvrCapture.Failure.signedOut {
      credential.removeIfCurrent()
      throw ShelvrCapture.Failure.signedOut
    } catch ShelvrCapture.Failure.proRequired { throw SaveFailure.proRequired }
    catch ShelvrCapture.Failure.refused("photo_limit") { throw SaveFailure.photoLimit }
    catch ShelvrCapture.Failure.refused("image_too_large") { throw SaveFailure.photoTooLarge }
    catch ShelvrCapture.Failure.refused("image_empty") { throw SaveFailure.photoEmpty }
  }
}
