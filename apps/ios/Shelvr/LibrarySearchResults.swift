import ShelvrKit
import SwiftUI

struct LibrarySearchResults: View {
  let query: String
  let state: LibrarySearchState
  let palette: HomeChromePalette
  let retry: () -> Void
  @Environment(\.copy) private var copy
  var body: some View {
    Group {
      switch state.display(for: query) {
      case .failure:
        Text(copy("errors.searchTitle"))
        Button(copy("common.retry"), action: retry)
      case let .items(items):
        if items.isEmpty { Text(copy("search.noResults", ["query": query])) }
        if items.count >= 50 { Text(copy("search.resultLimit")).font(.caption) }
        ForEach(items) { item in
          if let destination = AppLink("/item/" + item.id + "?from=home") {
            NavigationLink(value: destination) {
              VStack(alignment: .leading, spacing: 4) {
                LibrarySaveRow(save: item, featured: true)
                let names = item.placePins?.map(\.name) ?? []
                let places = names.isEmpty ? item.places ?? [] : names
                if !places.isEmpty { Text(places.joined(separator: " · ")).font(.caption).foregroundStyle(.secondary).lineLimit(2) }
              }
              .padding(10)
              .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
              .background(palette.frame, in: RoundedRectangle(cornerRadius: 16))
              .overlay { RoundedRectangle(cornerRadius: 16).strokeBorder(palette.border, lineWidth: 0.5) }
              .contentShape(Rectangle())
            }
          }
        }
      case .loading: ProgressView(copy("common.loading"))
      }
    }
  }
}
