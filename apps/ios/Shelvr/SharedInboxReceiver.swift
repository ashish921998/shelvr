import Combine
import CoreFoundation
import ShelvrInbox
import ShelvrKit
import SwiftUI

struct SharedInboxReceiver: ViewModifier {
  @Environment(Backend.self) private var backend
  @Environment(\.scenePhase) private var phase
  @Environment(\.copy) private var copy
  @State private var failed = false
  @State private var failedFile: URL?
  @State private var failureCopy = "share.singleFailure"
  @State private var wake: AsyncStream<ScenePhase>.Continuation?

  func body(content: Content) -> some View {
    content
      .onReceive(InboxSignal.shared.publisher) { _ in wake?.yield(phase) }
      .onChange(of: phase) { _, phase in wake?.yield(phase) }
      .task(id: backend.status) {
        failed = false
        failedFile = nil
        failureCopy = "share.singleFailure"
        guard let inbox = ShareInbox.system() else { return }
        if backend.status == .signedOut { try? inbox.activate(nil); return }
        guard backend.status == .signedIn else { return }
        let (events, continuation) = AsyncStream<ScenePhase>.makeStream(bufferingPolicy: .bufferingNewest(1))
        wake = continuation
        defer { continuation.finish() }
        continuation.yield(phase)
        for await currentPhase in events {
          guard !Task.isCancelled else { return }
          guard currentPhase == .active, !failed else { continue }
          failedFile = nil
          failureCopy = "share.retryHelp"
          do { try await drain(inbox) }
          catch where !Task.isCancelled { failed = true }
          catch {}
        }
      }
      .alert(copy("share.singleFailure"), isPresented: $failed) {
        Button(copy("common.tryAgain")) { failed = false; wake?.yield(phase) }
        if failedFile != nil {
          Button(copy("common.delete"), role: .destructive) {
            if let file = failedFile { try? FileManager.default.removeItem(at: file) }
            failedFile = nil
            failed = false
            wake?.yield(phase)
          }
        }
        Button(copy("common.close"), role: .cancel) {}
      } message: {
        Text(copy(failureCopy))
      }
  }

  private func drain(_ inbox: ShareInbox) async throws {
    for try await user in backend.query("users:getCurrentUser", as: AccountView.CurrentUser?.self) {
      try Task.checkCancellation()
      guard let owner = user?._id else { try inbox.activate(nil); return }
      try inbox.activate(owner)
      for batch in try inbox.batches() where (try inbox.owner(of: batch)) == owner {
        try await process(batch, inbox: inbox, owner: owner)
      }
      return
    }
  }

  private func process(_ batch: URL, inbox: ShareInbox, owner: String) async throws {
    for file in try inbox.manifests(in: batch) {
      try Task.checkCancellation()
      guard backend.status == .signedIn, inbox.activeOwner == owner else { return }
      do {
        try await send(file: file, batch: batch, inbox: inbox, owner: owner)
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
    try FileManager.default.removeItem(at: batch)
  }

  private func send(file: URL, batch: URL, inbox: ShareInbox, owner: String) async throws {
    let payload = try JSONDecoder().decode(InboxPayload.self, from: Data(contentsOf: file))
    switch payload.kind {
    case .link, .note:
      let note = payload.kind == .note
      var arguments = [
        note ? "text" : "url": payload.value, "operationId": payload.operationID,
        "saveSource": payload.siri == true ? "siri" : "share_extension"
      ]
      arguments["spaceId"] = payload.spaceID
      let _: String = try await backend.client.mutation(note ? "items:createNoteItem" : "items:createLinkItem", with: arguments)
    case .image:
      guard UUID(uuidString: payload.value) != nil else { throw CocoaError(.fileReadCorruptFile) }
      let imageURL = batch.appending(path: payload.value)
      let photo = try await Task.detached { try ImportPhoto(Data(contentsOf: imageURL, options: .mappedIfSafe)) }.value
      try Task.checkCancellation()
      guard backend.status == .signedIn, inbox.activeOwner == owner else { throw CancellationError() }
      if payload.siri == true {
        try await backend.prepareSiri(owner: owner)
        try Task.checkCancellation()
        guard let credential = SiriCredential.current(), credential.owner == owner else { throw ShelvrCapture.Failure.signedOut }
        do {
          _ = try await ShelvrCapture.saveImage(photo.data, contentType: photo.contentType, aspectRatio: photo.aspectRatio,
            isSticker: payload.sticker == true, spaceId: payload.spaceID, context: payload.context, operationId: payload.operationID,
            credentials: .init(siteUrl: credential.siteURL, token: credential.token))
        } catch {
          if case ShelvrCapture.Failure.signedOut = error { credential.removeIfCurrent() }
          throw error
        }
      } else {
        _ = try await backend.savePhoto(photo, operationID: payload.operationID, source: .share)
      }
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
