import AppIntents
internal import ExpoAppIntents
import Foundation
import UniformTypeIdentifiers

// Capture intents save straight to Convex (`ShelvrCapture`) so Siri answers without opening
// Shelvr. If the save cannot reach the server (offline, signed out on this device), the capture
// is queued for JavaScript (`src/lib/app-intents.tsx`), which saves it the next time Shelvr
// opens. A save the server refused (no Pro, photo limit) is not queued: it would only be
// refused again, so Siri says why instead.

#if compiler(>=6.4)
/// "Save a note in Shelvr: try the ramen place on 5th." The iOS 27 Siri finds this through the
/// `notes.createNote` schema, so no shortcut phrase is needed. Siri also sends "save this to
/// Shelvr" here for whatever is on screen, so `CaptureRouter` turns a page into a link and a
/// photo or screenshot into an image item; only plain text stays a note.
@available(iOS 27.0, *)
@AppIntent(schema: .notes.createNote)
struct SaveNoteIntent {
  static let openAppWhenRun: Bool = false

  var name: AttributedString
  var content: AttributedString?
  var attachments: [IntentFile]
  var isPinned: Bool
  var folder: SpaceEntity?

  @MainActor
  func perform() async throws -> some IntentResult & ReturnsValue<NoteEntity> & ProvidesDialog {
    let nameText = String(name.characters)
    let contentText = content.map { String($0.characters) }
    let text = Self.noteText(name: nameText, content: contentText)
    let links = CaptureRouter.linkAttributes(in: [name] + (content.map { [$0] } ?? []))
    let files = attachments.map { CaptureRouter.Attachment(data: $0.data, type: $0.type, filename: $0.filename) }
    let route = CaptureRouter.route(text: text, linkAttributes: links, attachments: files)
    let trace = CaptureRouter.trace(
      intent: "SaveNoteIntent", name: nameText, content: contentText, linkAttributes: links, attachments: files,
      route: route)
    ShelvrIntentLog.record("SaveNoteIntent.perform folder=\(folder?.id ?? "-") \(trace)")

    let saved: (NoteEntity, IntentDialog)
    switch route {
    case .link(let url):
      saved = await saveLink(url)
    case .images(let images):
      saved = try await saveImages(images, text: text)
    case .note:
      guard !text.isEmpty else {
        throw $name.needsValueError("What should the note say?")
      }
      saved = await saveNote(text)
    }
    return .result(value: saved.0, dialog: saved.1)
  }

  private var whereSuffix: String {
    folder.map { " to \($0.name)" } ?? ""
  }

  /// A page Siri passed along (from any browser): saved as a link, so Shelvr reads the article.
  @MainActor
  private func saveLink(_ url: URL) async -> (NoteEntity, IntentDialog) {
    let title = url.host()?.replacingOccurrences(of: "www.", with: "") ?? url.absoluteString
    let operationId = ShelvrCapture.newOperationId()
    do {
      let itemId = try await ShelvrCapture.save(
        kind: "link", url: url.absoluteString, spaceId: folder?.id, operationId: operationId)
      ShelvrIntentLog.record("SaveNoteIntent saved link \(itemId)")
      let dialog: IntentDialog =
        folder.map { "Saved \(title) to \($0.name) in Shelvr." } ?? "Saved \(title) to Shelvr."
      return (NoteEntity(id: itemId, text: url.absoluteString, folder: folder), dialog)
    } catch {
      ShelvrIntentLog.record("SaveNoteIntent link capture failed: \(error)")
      let queued = await CaptureFallback.queue(
        error, name: "saveLink",
        params: [
          "url": .string(url.absoluteString), "spaceId": folder.map { .string($0.id) } ?? .null,
          "operationId": .string(operationId),
        ])
      return (
        NoteEntity(id: queued.id, text: url.absoluteString, folder: folder),
        queued.dialog ?? "Shelvr will finish saving \(title)\(whereSuffix) the next time you open it."
      )
    }
  }

  /// Photos and screenshots: uploaded straight to Shelvr as image items, with Siri's words and
  /// the text read on the device as context for the classifier. "Save this chair" on one photo
  /// saves the chair alone as a sticker.
  @MainActor
  private func saveImages(_ images: [CaptureRouter.Attachment], text: String) async throws
    -> (NoteEntity, IntentDialog)
  {
    let saved = try await ImageCapture.save(
      images, words: text, sticker: StickerTarget(words: text), spaceId: folder?.id, spaceName: folder?.name,
      intent: "SaveNoteIntent")
    let label = text.isEmpty ? (images.count == 1 ? "Image" : "Images") : text
    return (NoteEntity(id: saved.itemId ?? UUID().uuidString, text: label, folder: folder), saved.dialog)
  }

  @MainActor
  private func saveNote(_ text: String) async -> (NoteEntity, IntentDialog) {
    let operationId = ShelvrCapture.newOperationId()
    do {
      let itemId = try await ShelvrCapture.save(
        kind: "note", text: text, spaceId: folder?.id, operationId: operationId)
      ShelvrIntentLog.record("SaveNoteIntent saved \(itemId)")
      let dialog: IntentDialog = folder.map { "Saved to \($0.name) in Shelvr." } ?? "Saved to Shelvr."
      return (NoteEntity(id: itemId, text: text, folder: folder), dialog)
    } catch {
      ShelvrIntentLog.record("SaveNoteIntent capture failed: \(error)")
      let queued = await CaptureFallback.queue(
        error, name: "saveNote",
        params: [
          "text": .string(text), "spaceId": folder.map { .string($0.id) } ?? .null,
          "operationId": .string(operationId),
        ])
      return (
        NoteEntity(id: queued.id, text: text, folder: folder),
        queued.dialog ?? "Shelvr will finish saving your note\(whereSuffix) the next time you open it."
      )
    }
  }

  /// Siri may put the whole note in `name`, or a title in `name` and the body in `content`.
  static func noteText(name: String, content: String?) -> String {
    let title = name.trimmingCharacters(in: .whitespacesAndNewlines)
    let body = content?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    if body.isEmpty || body == title { return title }
    if title.isEmpty || body.hasPrefix(title) { return body }
    return "\(title)\n\n\(body)"
  }
}
#endif

/// A plain intent with an image parameter, so Shortcuts and the share sheet can hand Shelvr
/// photos and screenshots on any iOS 18 device. It has no Siri phrases: Siri cannot fill the
/// parameter from the screen, so "save this image to Shelvr" goes to `SaveNoteIntent` instead.
/// Naming an object in "Cut Out" ("the chair") saves that object as a die-cut sticker instead.
@available(iOS 18.0, *)
struct SaveImageIntent: AppIntent {
  static let title: LocalizedStringResource = "Save an Image"
  static let description = IntentDescription(
    "Saves photos and screenshots to Shelvr, which tags and files them. Name an object to cut it out as a sticker.")
  static let openAppWhenRun: Bool = false

  @Parameter(title: "Images", supportedContentTypes: [.image], requestValueDialog: "Which image should Shelvr save?")
  var images: [IntentFile]

  @Parameter(
    title: "Cut Out", description: "An object to cut out of the image as a sticker, like \"the chair\".")
  var cutOut: String?

  static var parameterSummary: some ParameterSummary {
    Summary("Save \(\.$images) to Shelvr") {
      \.$cutOut
    }
  }

  @MainActor
  func perform() async throws -> some IntentResult & ProvidesDialog {
    let files = images
      .map { CaptureRouter.Attachment(data: $0.data, type: $0.type, filename: $0.filename) }
      .filter(CaptureRouter.isImage)
    guard !files.isEmpty else {
      throw $images.needsValueError("Which image should Shelvr save?")
    }
    let words = cutOut?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    let batch = Array(files.prefix(CaptureRouter.maxImages))
    let trace = CaptureRouter.trace(
      intent: "SaveImageIntent", name: words, content: nil, linkAttributes: [], attachments: files,
      route: .images(batch))
    ShelvrIntentLog.record("SaveImageIntent.perform \(trace)")
    let saved = try await ImageCapture.save(
      batch, words: words, sticker: words.isEmpty ? nil : StickerTarget(words: words, explicit: true), spaceId: nil, spaceName: nil,
      intent: "SaveImageIntent")
    return .result(dialog: saved.dialog)
  }
}

/// "Save this page to Shelvr." A plain intent with a URL parameter, so Siri can pass it the page
/// on screen. It returns only a dialog: returning a `browser.bookmark` schema entity (or using the
/// `browser.bookmarkURL` schema, which requires one) made iOS 27 stall the action before
/// `perform()` ran, until the app was killed.
@available(iOS 18.0, *)
struct SaveLinkIntent: AppIntent {
  static let title: LocalizedStringResource = "Save a Link"
  static let description = IntentDescription("Saves a web page to Shelvr, which reads and tags it for you.")
  static let openAppWhenRun: Bool = false

  @Parameter(title: "URL", requestValueDialog: "Which link should Shelvr save?")
  var url: URL

  @Parameter(title: "Name")
  var name: String?

  static var parameterSummary: some ParameterSummary {
    Summary("Save \(\.$url) to Shelvr")
  }

  @MainActor
  func perform() async throws -> some IntentResult & ProvidesDialog {
    ShelvrIntentLog.record("SaveLinkIntent.perform host=\(url.host() ?? "?")")
    let title = name?.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty ?? url.host() ?? url.absoluteString
    let operationId = ShelvrCapture.newOperationId()
    do {
      let itemId = try await ShelvrCapture.save(kind: "link", url: url.absoluteString, operationId: operationId)
      ShelvrIntentLog.record("SaveLinkIntent saved \(itemId)")
      return .result(dialog: "Saved \(title) to Shelvr.")
    } catch {
      ShelvrIntentLog.record("SaveLinkIntent capture failed: \(error)")
      let queued = await CaptureFallback.queue(
        error, name: "saveLink",
        params: ["url": .string(url.absoluteString), "operationId": .string(operationId)])
      return .result(dialog: queued.dialog ?? "Shelvr will finish saving \(title) the next time you open it.")
    }
  }
}

/// What a capture does when the server did not save it.
enum CaptureFallback {
  /// Siri's answer to a refusal the app could not fix by retrying, or nil when the capture should
  /// wait for the app.
  static func refusalDialog(for error: Error) -> IntentDialog? {
    guard let failure = error as? ShelvrCapture.Failure, !failure.isRetryableInApp else {
      return nil
    }
    switch failure {
    case .proRequired:
      return "Saving to Shelvr needs Shelvr Pro. Open Shelvr to continue."
    case .refused("photo_limit"):
      return "Your Shelvr photo limit is full. Delete some photos in Shelvr to save more."
    case .refused("image_too_large"):
      return "That image is too large for Shelvr."
    case .refused("invalid_url"):
      return "Shelvr can't save that link."
    default:
      return "Shelvr couldn't save that."
    }
  }

  /// Whether a refusal covers every save on the account (no Pro, a full photo limit) rather
  /// than just this one.
  static func refusesAccount(_ error: Error) -> Bool {
    switch error as? ShelvrCapture.Failure {
    case .proRequired?, .refused("photo_limit")?: return true
    default: return false
    }
  }

  /// Queues the capture for the app when a retry there can succeed. Returns the invocation id (or
  /// a fresh id when nothing was queued) and, for a refusal, what Siri should say instead.
  static func queue(_ error: Error, name: String, params: [String: AppIntentValue]) async
    -> (id: String, dialog: IntentDialog?)
  {
    if let dialog = refusalDialog(for: error) {
      return (UUID().uuidString, dialog)
    }
    let id = await AppIntentDispatcher.shared.dispatch(name: name, params: params)
    return (id, nil)
  }
}

extension String {
  fileprivate var nilIfEmpty: String? { isEmpty ? nil : self }
}
