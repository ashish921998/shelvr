import ShelvrKit
import SwiftUI

struct LibraryItemView: View {
  let id: String
  @Environment(Backend.self) private var backend
  @Environment(\.copy) private var copy
  @Environment(\.dismiss) private var dismiss
  @State private var confirmingDelete = false
  @State private var busy = false
  @State private var message = ""
  @State private var save: LibrarySave?
  @State private var loaded = false
  @State private var failed = false
  @State private var attempt = 0

  var body: some View {
    Group {
      if failed { Button(copy("common.retry")) { attempt += 1 } }
      else if let save {
        ScrollView {
          VStack(alignment: .leading, spacing: 16) {
            if let image = save.imageUrl ?? save.heroImageUrl, let url = URL(string: image) {
              AsyncImage(url: url) { image in image.resizable().scaledToFit() } placeholder: { ProgressView() }
            }
            Text(save.name(copy: copy)).font(.title.bold())
            if let description = save.description { Text(description).foregroundStyle(.secondary) }
            if let text = save.note ?? save.content { Text(text).textSelection(.enabled) }
            LibraryItemContents(save: save)
            if save.status == "ready", let link = AppLink("/edit-save-places?itemId=" + id) {
              NavigationLink(copy("placeCorrection.title"), value: link)
            }
            TimelineView(.periodic(from: .now, by: 30)) { time in
              if save.canRetry(at: time.date) {
                Button(copy("common.retry")) { Task { await retry() } }.disabled(busy)
              }
            }
            Button(copy("common.delete"), role: .destructive) { confirmingDelete = true }.disabled(busy)
            if !message.isEmpty { Text(message).foregroundStyle(.secondary) }
            if let raw = save.url, let url = URL(string: raw),
              ["http", "https"].contains(url.scheme?.lowercased() ?? ""), let host = url.host {
              Link(destination: url) { Label(save.siteName ?? host, systemImage: "arrow.up.right.square") }
            }
          }.frame(maxWidth: .infinity, alignment: .leading).padding()
        }
      } else if loaded { ContentUnavailableView(copy("common.unavailable"), systemImage: "bookmark.slash") }
      else { ProgressView() }
    }
    .confirmationDialog(copy("item.deleteTitle"), isPresented: $confirmingDelete, titleVisibility: .visible) {
      Button(copy("item.deleteEverywhere"), role: .destructive) { Task { await remove() } }
      Button(copy("common.cancel"), role: .cancel) {}
    } message: { Text(copy("item.deleteBody")) }
    .task(id: "\(id)-\(attempt)") {
      save = nil; loaded = false; failed = false
      do {
        for try await save in backend.librarySave(id: id) {
          guard !Task.isCancelled else { return }
          self.save = save; loaded = true
        }
      } catch { if !Task.isCancelled { failed = true } }
    }
  }

  private func retry() async {
    guard !busy else { return }
    busy = true
    defer { busy = false }
    do { message = try await backend.retrySave(id) ? "" : copy("item.stillWorking") }
    catch { message = copy("errors.retryTitle") }
  }

  private func remove() async {
    guard !busy else { return }
    busy = true
    defer { busy = false }
    do { try await backend.deleteSave(id); dismiss() }
    catch { message = copy("item.deleteFailed") }
  }
}
