import AppIntents
import Foundation
import ShelvrInbox
import ShelvrKit
import UniformTypeIdentifiers

private enum SiriSave {
  case link(URL)
  case note(String)
  case image(ImportPhoto)

  func capture() async throws -> IntentDialog {
    guard let account = SiriCredential.current() else { throw ShelvrCapture.Failure.signedOut }
    let credential = ShelvrCapture.Credentials(siteUrl: account.siteURL, token: account.token)
    let operation = ShelvrCapture.newOperationId()
    do {
      switch self {
      case .link(let url):
        _ = try await ShelvrCapture.save(kind: "link", url: url.absoluteString, operationId: operation, credentials: credential)
      case .note(let text):
        _ = try await ShelvrCapture.save(kind: "note", text: text, operationId: operation, credentials: credential)
      case .image(let image):
        _ = try await ShelvrCapture.saveImage(image.data, contentType: image.contentType, aspectRatio: image.aspectRatio,
          operationId: operation, credentials: credential)
      }
      return "Saved to Shelvr."
    } catch {
      if case ShelvrCapture.Failure.signedOut = error { await account.removeIfCurrent() }
      if let failure = error as? ShelvrCapture.Failure, !failure.isRetryableInApp { throw failure }
      guard let inbox = ShareInbox.system(), inbox.activeOwner == account.owner else { throw error }
      let stage = try inbox.stage(owner: account.owner)
      defer { try? FileManager.default.removeItem(at: stage) }
      let payload: InboxPayload
      switch self {
      case .link(let url):
        payload = InboxPayload(kind: .link, value: url.absoluteString, operationID: operation, siri: true)
      case .note(let text):
        payload = InboxPayload(kind: .note, value: text, operationID: operation, siri: true)
      case .image(let image):
        let name = UUID().uuidString
        try image.data.write(to: stage.appending(path: name))
        payload = InboxPayload(kind: .image, value: name, operationID: operation, siri: true)
      }
      try inbox.publish([payload], in: stage)
      return "Open Shelvr to finish saving."
    }
  }
}

struct SaveLinkIntent: AppIntent {
  static let title: LocalizedStringResource = "Save a Link"
  @Parameter(title: "Link") var url: URL
  func perform() async throws -> some IntentResult & ProvidesDialog {
    guard ["https", "http"].contains(url.scheme?.lowercased()) else { throw URLError(.badURL) }
    return .result(dialog: try await SiriSave.link(url).capture())
  }
}

struct SaveNoteIntent: AppIntent {
  static let title: LocalizedStringResource = "Save a Note"
  @Parameter(title: "Text") var text: String
  func perform() async throws -> some IntentResult & ProvidesDialog {
    return .result(dialog: try await SiriSave.note(text).capture())
  }
}

struct SaveImageIntent: AppIntent {
  static let title: LocalizedStringResource = "Save an Image"
  @Parameter(title: "Image", supportedContentTypes: [.image]) var image: IntentFile
  func perform() async throws -> some IntentResult & ProvidesDialog {
    return .result(dialog: try await SiriSave.image(ImportPhoto(image.data)).capture())
  }
}

struct ShelvrShortcuts: AppShortcutsProvider {
  static var appShortcuts: [AppShortcut] {
    AppShortcut(intent: SaveLinkIntent(), phrases: ["Save this page to \(.applicationName)", "Save this link to \(.applicationName)"],
      shortTitle: "Save a Link", systemImageName: "link")
    AppShortcut(intent: SaveNoteIntent(), phrases: ["Save a note in \(.applicationName)", "Add a note to \(.applicationName)"],
      shortTitle: "Save a Note", systemImageName: "square.and.pencil")
  }
}
