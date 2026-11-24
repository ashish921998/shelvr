import ShelvrKit
import SwiftUI

enum LibrarySearchState {
  case loading
  case items(String, [LibrarySave])
  case failure(String)
}

struct LibrarySearchResults: View {
  let query: String
  let state: LibrarySearchState
  let retry: () -> Void
  @Environment(\.copy) private var copy
  var body: some View {
    Group {
      switch state {
      case let .failure(term) where term == query:
        Text(copy("errors.searchTitle"))
        Button(copy("common.retry"), action: retry)
      case let .items(term, items) where term == query:
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
      default: ProgressView(copy("common.loading"))
      }
    }
  }
}
