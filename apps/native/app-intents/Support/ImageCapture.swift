import AppIntents
internal import ExpoAppIntents
internal import SubjectLift
import Foundation
import UniformTypeIdentifiers

/// Saves Siri's photos and screenshots straight to Shelvr as image items, for `SaveNoteIntent`
/// ("save this to Shelvr") and `SaveImageIntent` (Shortcuts). When the user named an object in a
/// single photo ("save this chair"), that object alone is saved as a die-cut sticker instead (see
/// `StickerTarget`); if no object matches, the photo is saved as is. Images that could not reach
/// the server wait for the app; images the server refused (no Pro, photo limit) do not.
@available(iOS 18.0, *)
enum ImageCapture {
  /// Returns the first saved item id (nil when nothing was saved) and what Siri should say.
  @MainActor
  static func save(
    _ images: [CaptureRouter.Attachment], words: String, sticker: StickerTarget?, spaceId: String?,
    spaceName: String?, intent: String
  ) async throws -> (itemId: String?, dialog: IntentDialog) {
    let whereSuffix = spaceName.map { " to \($0)" } ?? ""

    if images.count == 1, let target = sticker {
      switch await saveSticker(images[0], target: target, spaceId: spaceId, intent: intent) {
      case .saved(let itemId, let name):
        let what = name.map { "the \($0)" } ?? "it"
        return (itemId, "Cut out \(what) and saved it\(whereSuffix) in Shelvr.")
      case .refused(let dialog):
        return (nil, dialog)
      case .noMatch:
        break
      }
    }

    var savedIds: [String] = []
    // Each image keeps one operation id from here to the app's retry, so an upload the server
    // saved before its reply was lost is not saved twice.
    var unsaved: [(image: CaptureRouter.Attachment, operationId: String)] = []
    var refusal: IntentDialog?
    for image in images {
      let operationId = ShelvrCapture.newOperationId()
      do {
        let prepared = await Task.detached(priority: .userInitiated) { await CaptureRouter.prepare(image) }.value
        guard let prepared else {
          throw ShelvrCapture.Failure.badResponse
        }
        let context = [
          words.isEmpty ? nil : "Siri: \(words)",
          prepared.recognizedText.isEmpty ? nil : "Text in the image:\n\(prepared.recognizedText)",
        ].compactMap { $0 }.joined(separator: "\n\n")
        let itemId = try await ShelvrCapture.saveImage(
          prepared.data, contentType: prepared.contentType, aspectRatio: prepared.aspectRatio,
          spaceId: spaceId, context: context, operationId: operationId)
        ShelvrIntentLog.record("\(intent) saved image \(itemId)")
        savedIds.append(itemId)
      } catch {
        ShelvrIntentLog.record("\(intent) image capture failed: \(error)")
        if let dialog = CaptureFallback.refusalDialog(for: error) {
          // The server refused (no Pro, photo limit): the rest would be refused too.
          refusal = dialog
          break
        }
        unsaved.append((image, operationId))
      }
    }

    if let refusal, savedIds.isEmpty {
      return (nil, refusal)
    }

    if !unsaved.isEmpty && refusal == nil {
      do {
        let paths = try stage(unsaved.map(\.image))
        await AppIntentDispatcher.shared.dispatch(
          name: "saveImages",
          params: [
            "paths": .array(paths.map(AppIntentValue.string)),
            "operationIds": .array(unsaved.map { AppIntentValue.string($0.operationId) }),
            "spaceId": spaceId.map { .string($0) } ?? .null,
          ]
        )
      } catch {
        // Nowhere to keep them for the app (disk full): say what was saved rather than failing
        // the whole intent.
        ShelvrIntentLog.record("\(intent) could not stage images: \(error)")
        if savedIds.isEmpty {
          return (nil, "Shelvr couldn't save that. Try again from the share sheet.")
        }
        return (
          savedIds.first,
          "Saved \(savedIds.count) of \(images.count) images. Share the rest to Shelvr to save them."
        )
      }
    }

    if savedIds.count == images.count {
      let dialog: IntentDialog =
        images.count == 1
        ? (spaceName.map { "Saved to \($0) in Shelvr." } ?? "Saved to Shelvr.")
        : "Saved \(images.count) images\(whereSuffix) in Shelvr."
      return (savedIds.first, dialog)
    }
    if let refusal {
      return (savedIds.first, refusal)
    }
    if savedIds.isEmpty {
      return (nil, "Your images will be saved\(whereSuffix) when you open Shelvr.")
    }
    return (
      savedIds.first,
      "Saved \(savedIds.count) of \(images.count) images. Shelvr will save the rest when you open it."
    )
  }

  private enum StickerOutcome {
    case saved(itemId: String, name: String?)
    case refused(IntentDialog)
    case noMatch
  }

  /// Cuts the named object out on the device and saves it as a sticker. `noMatch` when no object
  /// matched or the upload failed for a reason worth retrying, so the caller saves the plain
  /// photo instead.
  @MainActor
  private static func saveSticker(
    _ image: CaptureRouter.Attachment, target: StickerTarget, spaceId: String?, intent: String
  ) async -> StickerOutcome {
    do {
      let cut = try await Task.detached(priority: .userInitiated) { () -> (png: Data, ratio: Double, name: String?)? in
        guard let cut = try target.cut(from: image.data) else { return nil }
        return (cut.sticker.png, Double(cut.sticker.width) / Double(max(cut.sticker.height, 1)), cut.name)
      }.value
      guard let cut else {
        ShelvrIntentLog.record("\(intent) no object matched; saving the photo")
        return .noMatch
      }
      let itemId = try await ShelvrCapture.saveImage(
        cut.png, contentType: "image/png", aspectRatio: cut.ratio, isSticker: true, spaceId: spaceId,
        operationId: ShelvrCapture.newOperationId())
      ShelvrIntentLog.record("\(intent) saved sticker \(itemId)")
      return .saved(itemId: itemId, name: cut.name)
    } catch {
      ShelvrIntentLog.record("\(intent) sticker capture failed: \(error); saving the photo")
      if let dialog = CaptureFallback.refusalDialog(for: error) {
        return .refused(dialog)
      }
      return .noMatch
    }
  }

  /// Copies images somewhere JavaScript can read them after the intent returns.
  static func stage(_ images: [CaptureRouter.Attachment]) throws -> [String] {
    guard !images.isEmpty else { return [] }
    let caches = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
    let directory = caches.appendingPathComponent("siri-attachments", isDirectory: true)
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    return try images.map { image in
      let ext = image.type?.preferredFilenameExtension ?? "jpg"
      let destination = directory.appendingPathComponent("\(UUID().uuidString).\(ext)")
      try image.data.write(to: destination)
      return destination.path
    }
  }
}
