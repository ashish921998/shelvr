import Combine
import CoreFoundation
import ShelvrInbox
import ShelvrKit
import SwiftUI
import UIKit
import UniformTypeIdentifiers

struct SharedInboxReceiver: ViewModifier {
  @Environment(Backend.self) private var backend
  @Environment(\.scenePhase) private var phase
  @Environment(\.copy) private var copy
  @State private var failed = false
  @State private var failedFile: URL?
  @State private var retainedFile: URL?
  @State private var failureCopy = "share.singleFailure"
  @State private var attempt = 0

  func body(content: Content) -> some View {
    content
      .onReceive(InboxSignal.shared.publisher) { _ in attempt += 1 }
      .task(id: "\(phase)-\(backend.status)-\(attempt)") {
        guard let inbox = ShareInbox.system() else { return }
        if backend.status == .signedOut { try? inbox.activate(nil); return }
        guard backend.status == .signedIn, phase == .active else { return }
        do {
          for try await user in backend.query("users:getCurrentUser", as: AccountView.CurrentUser?.self) {
            try Task.checkCancellation()
            guard let owner = user?._id else { try inbox.activate(nil); return }
            try inbox.activate(owner)
            for batch in try inbox.batches() where (try inbox.owner(of: batch)) == owner {
              try await process(batch, inbox: inbox, owner: owner)
            }
            return
          }
        } catch where !Task.isCancelled { failed = true }
        catch {}
      }
      .alert(copy("share.singleFailure"), isPresented: $failed) {
        if failureCopy == "share.longNoteRecovery", let selected = retainedFile {
          Button(copy("share.copyNote")) { copyRecoveredNote(selected) }
        } else {
          Button(copy("common.tryAgain")) { attempt += 1 }
        }
        if failedFile != nil && failureCopy != "share.longNoteRecovery" {
          Button(copy("common.delete"), role: .destructive) {
            if let file = failedFile { try? FileManager.default.removeItem(at: file) }
            failedFile = nil
            attempt += 1
          }
        }
        Button(copy("common.close"), role: .cancel) {}
      } message: {
        Text(copy(failureCopy))
      }
  }

  private func copyRecoveredNote(_ file: URL) {
    guard backend.status == .signedIn, let inbox = ShareInbox.system(), let owner = inbox.activeOwner else { return }
    let succeeded = try? inbox.copyAndRemoveNote(file, owner: owner) { text in
      guard !SiriText.fitsLibrary(text) else { return false }
      UIPasteboard.general.setItems([[UTType.utf8PlainText.identifier: text]], options: [.localOnly: true])
      return UIPasteboard.general.string == text
    }
    guard succeeded == true else { return }
    retainedFile = nil
    failedFile = nil
    attempt += 1
  }

  private func process(_ batch: URL, inbox: ShareInbox, owner: String) async throws {
    var retainedNote = false
    for file in try inbox.manifests(in: batch) {
      try Task.checkCancellation()
      guard backend.status == .signedIn, inbox.activeOwner == owner else { return }
      do {
        let payload = try JSONDecoder().decode(InboxPayload.self, from: Data(contentsOf: file))
        if payload.siri == true, payload.kind == .note, !SiriText.fitsLibrary(payload.value) {
          retainedNote = true
          if let selected = retainedFile, FileManager.default.fileExists(atPath: selected.path),
            (try? inbox.owner(of: selected.deletingLastPathComponent())) == owner {
            failedFile = selected
          } else {
            retainedFile = file
            failedFile = file
          }
          failureCopy = "share.longNoteRecovery"
          failed = true
          continue
        }
        try await send(payload, batch: batch, inbox: inbox, owner: owner)
      } catch {
        if !Task.isCancelled {
          failedFile = file
          switch error as? ShelvrCapture.Failure {
          case .proRequired: failureCopy = "freePlan.photosNeedPro"
          case .refused("photo_limit"): failureCopy = "errors.photoLimit"
          case .refused("image_too_large"): failureCopy = "errors.photoTooLarge"
          case .refused("image_empty"): failureCopy = "errors.photoEmpty"
          default: failureCopy = ImportPhoto.failureCopy(error)
          }
          if failureCopy == "errors.savePhoto" { failureCopy = "share.retryHelp" }
          if failureCopy == "freePlan.photosNeedPro",
            let payload = try? JSONDecoder().decode(InboxPayload.self, from: Data(contentsOf: file)),
            payload.kind == .link { failureCopy = "freePlan.leftBody" }
        }
        throw error
      }
      try Task.checkCancellation()
      try FileManager.default.removeItem(at: file)
    }
    if !retainedNote { try FileManager.default.removeItem(at: batch) }
  }

  private func send(_ payload: InboxPayload, batch: URL, inbox: ShareInbox, owner: String) async throws {
    switch payload.kind {
    case .link, .note:
      let note = payload.kind == .note
      if note && payload.siri == true && !SiriText.fitsCapture(payload.value) {
        try await recoverLongNote(payload, owner: owner, inbox: inbox)
      } else if payload.siri == true {
        try await withCaptureToken(owner: owner) { credentials in
          _ = try await ShelvrCapture.save(kind: note ? "note" : "link", text: note ? payload.value : nil,
            url: note ? nil : payload.value, spaceId: payload.spaceID, operationId: payload.operationID, credentials: credentials)
        }
      } else {
        let _: String = try await backend.client.mutation(note ? "items:createNoteItem" : "items:createLinkItem", with: [
          note ? "text" : "url": payload.value, "operationId": payload.operationID, "saveSource": "share_extension"
        ])
      }
    case .image:
      guard UUID(uuidString: payload.value) != nil else { throw CocoaError(.fileReadCorruptFile) }
      let imageURL = batch.appending(path: payload.value)
      let photo = try await Task.detached { try ImportPhoto(Data(contentsOf: imageURL, options: .mappedIfSafe)) }.value
      try Task.checkCancellation()
      guard backend.status == .signedIn, inbox.activeOwner == owner else { throw CancellationError() }
      if payload.siri == true {
        try await withCaptureToken(owner: owner) { credentials in
          _ = try await ShelvrCapture.saveImage(photo.data, contentType: photo.contentType, aspectRatio: photo.aspectRatio,
            isSticker: payload.sticker == true, spaceId: payload.spaceID, context: payload.context, operationId: payload.operationID,
            credentials: credentials)
        }
      } else {
        _ = try await backend.savePhoto(photo, operationID: payload.operationID, source: .share)
      }
    }
  }

  private func recoverLongNote(_ payload: InboxPayload, owner: String, inbox: ShareInbox) async throws {
    var arguments = ["text": payload.value, "operationId": payload.operationID, "saveSource": "siri"]
    if let id = payload.spaceID {
      struct Folder: Decodable { let _id: String }
      for try await folder in backend.query("spaces:getSpace", with: ["id": id], as: Folder?.self) {
        arguments["spaceId"] = folder?._id
        break
      }
    }
    try Task.checkCancellation()
    guard backend.status == .signedIn, inbox.activeOwner == owner else { throw CancellationError() }
    let _: String = try await backend.client.mutation("items:createNoteItem", with: arguments)
  }

  private func withCaptureToken(owner: String, perform: (ShelvrCapture.Credentials) async throws -> Void) async throws {
    try await backend.prepareSiri(owner: owner)
    try Task.checkCancellation()
    guard let credential = SiriCredential.current(), credential.owner == owner else { throw ShelvrCapture.Failure.signedOut }
    do { try await perform(.init(siteUrl: credential.siteURL, token: credential.token)) }
    catch {
      if case ShelvrCapture.Failure.signedOut = error { credential.removeIfCurrent() }
      throw error
    }
  }

}


@MainActor private final class InboxSignal {
  static let shared = InboxSignal()
  private let name = Notification.Name(ShareInbox.notification)
  var publisher: NotificationCenter.Publisher { NotificationCenter.default.publisher(for: name) }

  private init() {
    CFNotificationCenterAddObserver(CFNotificationCenterGetDarwinNotifyCenter(),
      Unmanaged.passUnretained(self).toOpaque(), { _, _, _, _, _ in
        DispatchQueue.main.async {
          NotificationCenter.default.post(name: Notification.Name(ShareInbox.notification), object: nil)
        }
      }, ShareInbox.notification as CFString, nil, .deliverImmediately)
  }
}
