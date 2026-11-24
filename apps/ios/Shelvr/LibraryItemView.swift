import ShelvrKit
import SwiftUI

struct LibraryItemView: View {
  let id: String
  @Environment(Backend.self) private var backend
  @Environment(\.copy) private var copy
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
            if let raw = save.url, let url = URL(string: raw),
              ["http", "https"].contains(url.scheme?.lowercased() ?? ""), let host = url.host {
              Link(destination: url) { Label(save.siteName ?? host, systemImage: "arrow.up.right.square") }
            }
          }.frame(maxWidth: .infinity, alignment: .leading).padding()
        }
      } else if loaded { ContentUnavailableView(copy("common.unavailable"), systemImage: "bookmark.slash") }
      else { ProgressView() }
    }
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
}
