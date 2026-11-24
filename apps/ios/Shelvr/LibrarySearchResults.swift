import ShelvrKit
import SwiftUI

struct LibrarySearchResults: View {
  let query: String
  @Environment(Backend.self) private var backend
  @Environment(\.copy) private var copy
  @State private var items: [LibrarySave]?
  @State private var failed = false
  @State private var attempt = 0

  var body: some View {
    Group {
      if failed {
        Text(copy("errors.searchTitle"))
        Button(copy("common.retry")) { attempt += 1 }
      } else if let items {
        if items.isEmpty { Text(copy("search.noResults", ["query": query])) }
        if items.count >= 50 { Text(copy("search.resultLimit")).font(.caption) }
        ForEach(items) { item in
          if let destination = AppLink("/item/" + item.id) {
            NavigationLink(value: destination) {
              VStack(alignment: .leading, spacing: 4) {
                LibrarySaveRow(save: item)
                let names = item.placePins?.map(\.name) ?? []
                let places = names.isEmpty ? item.places ?? [] : names
                if !places.isEmpty { Text(places.joined(separator: " · ")).font(.caption).foregroundStyle(.secondary).lineLimit(2) }
              }
            }
          }
        }
      } else { ProgressView(copy("common.loading")) }
    }
    .task(id: attempt) {
      failed = false
      do {
        try await Task.sleep(for: .milliseconds(250))
        for try await items in backend.searchLibrary(query) {
          guard !Task.isCancelled else { return }
          self.items = items
        }
      } catch { if !Task.isCancelled { failed = true } }
    }
  }
}
