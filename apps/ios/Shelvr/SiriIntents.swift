import AppIntents
import Foundation
import ShelvrInbox
import ShelvrKit
import UniformTypeIdentifiers

private struct SiriNoteTooLong: LocalizedError {
  var errorDescription: String? { String(localized: "This note is too long. Shorten it and try again.") }
}

private enum SiriSave {
  case link(URL)
  case note(String)
  case image(ImportPhoto, context: String?, sticker: Bool = false)

  func capture(spaceID: String? = nil, account: SiriCredential? = SiriCredential.current()) async throws -> (id: String, dialog: IntentDialog) {
    guard let account, SiriCredential.current()?.token == account.token else { throw ShelvrCapture.Failure.signedOut }
    let credential = ShelvrCapture.Credentials(siteUrl: account.siteURL, token: account.token)
    let operation = ShelvrCapture.newOperationId()
    if case let .note(text) = self {
      switch SiriText.captureRoute(text) {
      case .tooLong: throw SiriNoteTooLong()
      case .inbox:
        return try queue(operation: operation, spaceID: spaceID, owner: account.owner,
          unavailable: ShelvrCapture.Failure.signedOut)
      case .direct: break
      }
    }
    do {
      let id: String
      switch self {
      case .link(let url):
        id = try await ShelvrCapture.save(kind: "link", url: url.absoluteString, spaceId: spaceID, operationId: operation, credentials: credential)
      case .note(let text):
        id = try await ShelvrCapture.save(kind: "note", text: text, spaceId: spaceID, operationId: operation, credentials: credential)
      case .image(let image, let context, let sticker):
        id = try await ShelvrCapture.saveImage(image.data, contentType: image.contentType, aspectRatio: image.aspectRatio,
          isSticker: sticker, spaceId: spaceID, context: context, operationId: operation, credentials: credential)
      }
      return (id, "Saved to Shelvr.")
    } catch {
      if case ShelvrCapture.Failure.signedOut = error { await account.removeIfCurrent() }
      if let failure = error as? ShelvrCapture.Failure, !failure.isRetryableInApp { throw failure }
      return try queue(operation: operation, spaceID: spaceID, owner: account.owner, unavailable: error)
    }
  }

  private func queue(operation: String, spaceID: String?, owner: String, unavailable: any Error)
    throws -> (id: String, dialog: IntentDialog) {
    guard let inbox = ShareInbox.system(), inbox.activeOwner == owner else { throw unavailable }
    let stage = try inbox.stage(owner: owner)
    defer { try? FileManager.default.removeItem(at: stage) }
    let payload: InboxPayload
    switch self {
    case .link(let url):
      payload = InboxPayload(kind: .link, value: url.absoluteString, operationID: operation, siri: true, spaceID: spaceID)
    case .note(let text):
      payload = InboxPayload(kind: .note, value: text, operationID: operation, siri: true, spaceID: spaceID)
    case .image(let image, let context, let sticker):
      let name = UUID().uuidString
      try image.data.write(to: stage.appending(path: name))
      payload = InboxPayload(kind: .image, value: name, operationID: operation, siri: true, spaceID: spaceID, context: context, sticker: sticker)
    }
    try inbox.publish([payload], in: stage)
    return ("queued:" + operation, "Open Shelvr to finish saving.")
  }
}

struct SaveLinkIntent: AppIntent {
  static let title: LocalizedStringResource = "Save a Link"
  @Parameter(title: "Link") var url: URL
  func perform() async throws -> some IntentResult & ProvidesDialog {
    guard ["https", "http"].contains(url.scheme?.lowercased()) else { throw URLError(.badURL) }
    return .result(dialog: try await SiriSave.link(url).capture().dialog)
  }
}

#if compiler(>=6.4)
@available(iOS 27.0, *)
@AppIntent(schema: .notes.createNote)
struct SaveNoteIntent {
  var name: AttributedString
  var content: AttributedString?
  var attachments: [IntentFile]
  var isPinned: Bool
  var folder: SpaceEntity?

  @MainActor func perform() async throws -> some IntentResult & ReturnsValue<NoteEntity> & ProvidesDialog {
    guard let account = SiriCredential.current() else { throw ShelvrCapture.Failure.signedOut }
    let nameText = String(name.characters)
    let contentText = content.map { String($0.characters) }
    let text = SiriText.noteText(name: nameText, content: contentText)
    let files = attachments.map { CaptureRouter.Attachment(data: $0.data, type: $0.type, filename: $0.filename) }
    let links = SiriText.pageLink(name: name, content: content).map { [$0] } ?? []
    let result: (id: String, dialog: IntentDialog)
    let entityText: String
    switch CaptureRouter.route(text: text, linkAttributes: links, attachments: files) {
    case .link(let url):
      entityText = url.absoluteString
      result = try await SiriSave.link(url).capture(spaceID: folder?.id, account: account)
    case .note:
      guard !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
        throw $name.needsValueError("What should the note say?")
      }
      entityText = text
      result = try await SiriSave.note(text).capture(spaceID: folder?.id, account: account)
    case .images(let images):
      entityText = SiriText.entityContent(kind: "image", value: nil, title: "", photoLabel: Copy()("item.photo"))
      result = try await captureImages(images, total: files.filter(CaptureRouter.isImage).count, words: text, account: account)

    }
    return .result(value: NoteEntity(id: result.id, text: entityText, folder: folder), dialog: result.dialog)
  }

  @MainActor private func captureImages(_ images: [CaptureRouter.Attachment], total: Int, words: String, account: SiriCredential)
    async throws -> (id: String, dialog: IntentDialog)
  {
    if images.count == 1, let image = images.first, let target = StickerTarget(words: words),
      let cut = try? await Task.detached(operation: { try target.cut(from: image.data)?.sticker.png }).value {
      return try await SiriSave.image(ImportPhoto(cut), context: words, sticker: true).capture(spaceID: folder?.id, account: account)
    }
    var batch = SiriBatch()
    var lastError: Error = CocoaError(.fileReadCorruptFile)
    for image in images {
      guard SiriCredential.current()?.token == account.token else { lastError = ShelvrCapture.Failure.signedOut; break }
      do {
        guard let prepared = await CaptureRouter.prepare(image) else { throw CocoaError(.fileReadCorruptFile) }
        let context = [words, prepared.recognizedText].filter { !$0.isEmpty }.joined(separator: "\n")
        let result = try await SiriSave.image(ImportPhoto(prepared.data), context: context).capture(spaceID: folder?.id, account: account)
        batch.accepted(result.id)
      } catch { lastError = error }
    }
    guard let firstID = batch.firstID else { throw lastError }
    let dialog: IntentDialog = "Saved \(batch.saved). Queued for Shelvr: \(batch.queued). Couldn’t save: \(batch.failed(of: total))."
    return (firstID, dialog)
  }

}
#endif

@available(iOS, introduced: 18, obsoleted: 27)
struct SavePlainNoteIntent: AppIntent {
  static let title: LocalizedStringResource = "Save a Note"
  @Parameter(title: "Text") var text: String
  func perform() async throws -> some IntentResult & ProvidesDialog {
    .result(dialog: try await SiriSave.note(text).capture().dialog)
  }
}

struct SaveImageIntent: AppIntent {
  static let title: LocalizedStringResource = "Save an Image"
  @Parameter(title: "Image", supportedContentTypes: [.image]) var image: IntentFile
  func perform() async throws -> some IntentResult & ProvidesDialog {
    return .result(dialog: try await SiriSave.image(ImportPhoto(image.data), context: nil).capture().dialog)
  }
}

struct ShelvrShortcuts: AppShortcutsProvider {
  static var appShortcuts: [AppShortcut] {
    AppShortcut(intent: SaveLinkIntent(), phrases: ["Save this page to \(.applicationName)", "Save this link to \(.applicationName)"],
      shortTitle: "Save a Link", systemImageName: "link")
    AppShortcut(intent: SavePlainNoteIntent(), phrases: ["Save a note in \(.applicationName)", "Add a note to \(.applicationName)"],
      shortTitle: "Save a Note", systemImageName: "square.and.pencil")
    #if compiler(>=6.4)
    if #available(iOS 27.0, *) {
      AppShortcut(intent: SaveNoteIntent(), phrases: ["Save a note in \(.applicationName)", "Add a note to \(.applicationName)",
        "Save a note to \(\.$folder) in \(.applicationName)"], shortTitle: "Save a Note", systemImageName: "square.and.pencil")
      AppShortcut(intent: SearchShelvrIntent(), phrases: ["Search \(.applicationName)", "Find something in \(.applicationName)"],
        shortTitle: "Search Shelvr", systemImageName: "magnifyingglass")
      AppShortcut(intent: OpenSpaceIntent(), phrases: ["Open \(\.$target) in \(.applicationName)", "Show my \(\.$target) space in \(.applicationName)"],
        shortTitle: "Open a Space", systemImageName: "square.stack")
    }
    #endif
  }
}
