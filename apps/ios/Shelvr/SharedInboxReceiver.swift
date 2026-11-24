import Darwin
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
  @State private var attempt = 0
  @State private var notificationToken: Int32?

  func body(content: Content) -> some View {
    content
      .onAppear {
        var token: Int32 = 0
        if notify_register_dispatch(ShareInbox.notification, &token, .main, { _ in
          MainActor.assumeIsolated { attempt += 1 }
        }) == NOTIFY_STATUS_OK { notificationToken = token }
      }
      .onDisappear {
        if let notificationToken { notify_cancel(notificationToken) }
        notificationToken = nil
      }
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
        Button(copy("common.tryAgain")) { attempt += 1 }
        if failedFile != nil {
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

  private func process(_ batch: URL, inbox: ShareInbox, owner: String) async throws {
    for file in try inbox.manifests(in: batch) {
      try Task.checkCancellation()
      guard backend.status == .signedIn, inbox.activeOwner == owner else { return }
      do {
        try await send(file: file, batch: batch, inbox: inbox, owner: owner)
      } catch {
        if !Task.isCancelled {
          failedFile = file
          failureCopy = ImportPhoto.failureCopy(error)
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
    case .link:
      let _: String = try await backend.client.mutation("items:createLinkItem", with: [
        "url": payload.value, "operationId": payload.operationID, "saveSource": "share_extension"
      ])
    case .image:
      guard UUID(uuidString: payload.value) != nil else { throw CocoaError(.fileReadCorruptFile) }
      let imageURL = batch.appending(path: payload.value)
      let photo = try await Task.detached { try ImportPhoto(Data(contentsOf: imageURL, options: .mappedIfSafe)) }.value
      try Task.checkCancellation()
      guard backend.status == .signedIn, inbox.activeOwner == owner else { throw CancellationError() }
      _ = try await backend.savePhoto(photo, operationID: payload.operationID, fromShare: true)
    }
  }
}
