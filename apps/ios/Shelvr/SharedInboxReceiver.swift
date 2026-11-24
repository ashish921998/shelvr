import Combine
import CoreFoundation
import ShelvrInbox
import ShelvrKit
import SwiftUI

struct SharedInboxReceiver: ViewModifier {
  private struct Failure {
    let file: URL
    let message: String
  }

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
          catch is CancellationError { continue }
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
      var firstFailure: Failure?
      for batch in try inbox.batches() where (try inbox.owner(of: batch)) == owner {
        let failure = try await process(batch, inbox: inbox, owner: owner)
        firstFailure = firstFailure ?? failure
      }
      if let firstFailure {
        failedFile = firstFailure.file
        failureCopy = firstFailure.message
        failed = true
      }
      return
    }
  }

  private func process(_ batch: URL, inbox: ShareInbox, owner: String) async throws -> Failure? {
    let refusal = try await inbox.drain(batch, owner: owner) { file in
      try backend.requireShareOwner(owner)
      try await send(file: file, batch: batch, inbox: inbox, owner: owner)
      return true
    }
    return refusal.map { Failure(file: $0.file, message: self.refusal($0.error, at: $0.file)) }
  }

  private func refusal(_ error: Error, at file: URL) -> String {
    let message = ImportPhoto.failureCopy(error)
    if message == "errors.savePhoto" { return "share.retryHelp" }
    if message == "freePlan.photosNeedPro",
      let payload = try? JSONDecoder().decode(InboxPayload.self, from: Data(contentsOf: file)),
      payload.kind == .link { return "freePlan.leftBody" }
    return message
  }

  private func send(file: URL, batch: URL, inbox: ShareInbox, owner: String) async throws {
    let payload = try JSONDecoder().decode(InboxPayload.self, from: Data(contentsOf: file))
    switch payload.kind {
    case .link:
      try backend.requireShareOwner(owner)
      let _: String = try await backend.client.mutation("items:createLinkItem", with: [
        "url": payload.value, "operationId": payload.operationID, "saveSource": "share_extension"
      ])
    case .image:
      guard UUID(uuidString: payload.value) != nil else { throw CocoaError(.fileReadCorruptFile) }
      let imageURL = batch.appending(path: payload.value)
      let photo = try await Task.detached { try ImportPhoto(Data(contentsOf: imageURL, options: .mappedIfSafe)) }.value
      try Task.checkCancellation()
      guard backend.status == .signedIn, inbox.activeOwner == owner else { throw CancellationError() }
      _ = try await backend.savePhoto(photo, operationID: payload.operationID, fromShare: true, owner: owner)
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
