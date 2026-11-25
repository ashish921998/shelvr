import ShelvrKit
import SwiftUI

struct LibraryView: View {
  enum Screen { case home, saves, review }
  struct SearchSeed: Equatable {
    let id = UUID()
    let term: String
  }
  let screen: Screen
  var searchSeed: SearchSeed? = nil
  var searchFocusChanged: (Bool) -> Void = { _ in }
  @Environment(Backend.self) private var backend
  @Environment(\.copy) private var copy
  @Environment(\.colorScheme) private var scheme
  @Environment(\.dynamicTypeSize) private var dynamicType
  @AppStorage("swift.appearance") private var appearance = "system"
  @State private var pages: [LibraryPage] = []
  @State private var requested = 1
  @State private var failures: Set<Int> = []
  @State private var attempt = 0
  @State private var search = ""
  @State private var searchState = LibrarySearchState.loading
  @State private var searchAttempt = 0
  @FocusState private var searchFocused: Bool
  private struct SearchRequest: Equatable { let query: String; let attempt: Int }
  private var searchQuery: String { search.trimmingCharacters(in: .whitespacesAndNewlines) }
  @State private var unplacedID: String?

  private var rows: [LibrarySave] {
    var seen = Set<String>()
    return pages.flatMap(\.page).filter { seen.insert($0.id).inserted }
  }

  private var subscriptions: [String?] {
    var cursors: [String?] = [nil]
    for page in pages.prefix(requested - 1) {
      guard !page.isDone else { break }
      cursors.append(page.continueCursor)
    }
    return cursors
  }

  var body: some View {
    Group {
      if screen == .home { libraryHome }
      else { List { libraryRows } }
    }
    .onChange(of: searchSeed, initial: true) { _, seed in
      if let seed { search = seed.term }
    }
    .task(id: SearchRequest(query: searchQuery, attempt: searchAttempt)) {
      let term = searchQuery
      guard !term.isEmpty else { searchState = .loading; return }
      do {
        try await Task.sleep(for: .milliseconds(250))
        for try await items in backend.searchLibrary(term) {
          guard !Task.isCancelled else { return }
          searchState = .items(term, items)
        }
      } catch { if !Task.isCancelled { searchState = .failure(term) } }
    }
    .onChange(of: rows.map { Outcome(id: $0.id, status: $0.status, needsReview: $0.type == "link" && $0.needsReview) }) { previous, current in
      guard screen == .home else { return }
      let reading = Set(previous.filter { $0.status == "processing" }.map(\.id))
      if let finished = current.first(where: { $0.needsReview && reading.contains($0.id) }) {
        unplacedID = finished.id
      }
    }
    .task(id: unplacedID) {
      guard unplacedID != nil else { return }
      try? await Task.sleep(for: .seconds(8))
      if !Task.isCancelled { unplacedID = nil }
    }
    .background {
      ZStack {
        ForEach(Array(subscriptions.enumerated()), id: \.offset) { index, cursor in
          Color.clear.task(id: Load(cursor: cursor, attempt: attempt)) {
            await load(index, cursor)
          }
        }
      }
    }
    .navigationTitle(copy(screen == .home ? "navigation.library" : screen == .saves ? "homePlaces.allSaves" : "homePlaces.reviewTitle"))
  }

  private var libraryHome: some View {
    let palette = HomeChromePalette(scheme, appearance: appearance)
    return ScrollView {
      LazyVStack(alignment: .leading, spacing: 18) {
        HStack(spacing: 8) {
          Image(systemName: "magnifyingglass").foregroundStyle(palette.muted).accessibilityHidden(true)
          TextField(copy("search.placeholder"), text: $search)
            .textInputAutocapitalization(.never).autocorrectionDisabled().submitLabel(.search)
            .focused($searchFocused).onSubmit { searchFocused = false }
            .font(.custom("Satoshi-Regular", size: 16, relativeTo: .body))
          if !search.isEmpty {
            Button { search = "" } label: {
              Image(systemName: "xmark.circle.fill").frame(width: 44, height: 44)
            }.accessibilityLabel(copy("search.clear"))
          }
        }
        .padding(.leading, 16).padding(.trailing, 6).frame(minHeight: 52)
        .background(palette.surface, in: Capsule())
        .overlay { Capsule().strokeBorder(palette.border, lineWidth: 0.5) }

        if searchQuery.isEmpty { homeSections(palette) }
        else {
          LibrarySearchResults(query: searchQuery, state: searchState, palette: palette) {
            searchState = .loading
            searchAttempt += 1
          }
        }
      }
      .padding(.horizontal, 20).padding(.vertical, 12)
    }
    .foregroundStyle(palette.foreground)
    .background(palette.background.ignoresSafeArea())
    .scrollDismissesKeyboard(.interactively)
    .buttonStyle(HomeChromePressStyle())
    .onChange(of: searchFocused, initial: true) { searchFocusChanged(searchFocused) }
    .onDisappear { searchFocusChanged(false) }
  }

  @ViewBuilder private func homeSections(_ palette: HomeChromePalette) -> some View {
    if let id = unplacedID, rows.contains(where: { $0.id == id && $0.needsReview }),
      let destination = AppLink("/item/" + id) {
      HStack {
        NavigationLink(value: destination) {
          Label(copy("homePlaces.toastNoPlace"), systemImage: "mappin.slash")
        }
        Spacer()
        Button { unplacedID = nil } label: {
          Image(systemName: "xmark").frame(width: 44, height: 44)
        }.accessibilityLabel(copy("common.dismiss"))
      }
      .padding(.leading, 12)
      .background(palette.surface, in: RoundedRectangle(cornerRadius: 12))
    }

    LazyVGrid(columns: homeColumns(2), spacing: 8) {
      homeShortcut("/saves", "homePlaces.allSaves", "bookmark", palette: palette, prominent: true)
      homeShortcut("/cities", "homePlaces.cities", "building.2", palette: palette, prominent: true)
    }
    LazyVGrid(columns: homeColumns(3), spacing: 8) {
      homeShortcut("/trips", "navigation.trips", "airplane", palette: palette)
      homeShortcut("/collections", "homePlaces.collections", "person.2", palette: palette)
      homeShortcut("/passport", "passport.title", "book.closed", palette: palette)
    }
    if rows.contains(where: \.needsReview) || pages.last?.isDone == false {
      homeShortcut("/review-saves", "homePlaces.withoutPlace", "mappin.slash", palette: palette, horizontal: true)
    }

    if pages.isEmpty && failures.isEmpty { ProgressView(copy("common.loading")) }
    if !pages.isEmpty && rows.isEmpty {
      ContentUnavailableView(copy("homePlaces.emptyTitle"), systemImage: "bookmark",
        description: Text(copy("homePlaces.emptyBody")))
    }

    let recents = Array(rows.filter { !$0.needsReview }.prefix(8))
    if !recents.isEmpty {
      VStack(alignment: .leading, spacing: 10) {
        Text(copy("homePlaces.recents"))
          .font(.custom("Satoshi-Bold", size: 22, relativeTo: .title3))
          .accessibilityAddTraits(.isHeader)
        ForEach(LibrarySave.days(recents), id: \.0) { day, saves in
          Text(dayTitle(day)).font(.custom("Satoshi-Bold", size: 13, relativeTo: .footnote))
            .foregroundStyle(palette.muted).accessibilityAddTraits(.isHeader)
          ForEach(saves) { save in
            if let link = AppLink("/item/" + save.id) {
              NavigationLink(value: link) {
                LibrarySaveRow(save: save, featured: true)
                  .padding(10)
                  .frame(maxWidth: .infinity, alignment: .leading)
                  .background(palette.frame, in: RoundedRectangle(cornerRadius: 16))
                  .overlay { RoundedRectangle(cornerRadius: 16).strokeBorder(palette.border, lineWidth: 0.5) }
              }
            }
          }
        }
      }
    }
    if !failures.isEmpty { retryButton }
  }

  @ViewBuilder private var libraryRows: some View {
    if pages.isEmpty && failures.isEmpty { ProgressView() }
    if !pages.isEmpty {
      let visible = screen == .review ? rows.filter(\.needsReview) : rows
      if screen == .review && visible.isEmpty && pages.last?.isDone == true {
        ContentUnavailableView(copy("digest.emptyTitle"), systemImage: "checkmark.circle")
      } else if rows.isEmpty && screen != .review {
        ContentUnavailableView(copy("homePlaces.emptyTitle"), systemImage: "bookmark",
          description: Text(copy("homePlaces.emptyBody")))
      }
      ForEach(LibrarySave.days(visible), id: \.0) { day, saves in
        Section(dayTitle(day)) {
          ForEach(saves) { save in
            if let link = AppLink("/item/" + save.id) {
              NavigationLink(value: link) { LibrarySaveRow(save: save) }
            }
          }
        }
      }
      if let last = pages.last, !last.isDone, failures.isEmpty {
        ProgressView().onAppear { requested = pages.count + 1 }
          .id(last.continueCursor)
      }
    }
    if !failures.isEmpty { retryButton }
  }

  private var retryButton: some View {
    Button(copy("common.retry")) { failures.removeAll(); attempt += 1 }
  }

  private func homeColumns(_ count: Int) -> [GridItem] {
    Array(repeating: GridItem(.flexible(), spacing: 8), count: dynamicType.isAccessibilitySize ? 1 : count)
  }

  @ViewBuilder
  private func homeShortcut(_ path: String, _ title: String, _ symbol: String, palette: HomeChromePalette,
    prominent: Bool = false, horizontal: Bool = false) -> some View {
    if let destination = AppLink(path) {
      let layout = horizontal ? AnyLayout(HStackLayout(spacing: 8)) : AnyLayout(VStackLayout(alignment: .leading, spacing: 8))
      NavigationLink(value: destination) {
        layout {
          Image(systemName: symbol)
            .font(.system(size: prominent ? 22 : 17, weight: .medium))
            .foregroundStyle(palette.primaryText).accessibilityHidden(true)
          Text(copy(title))
            .font(.custom("Satoshi-Bold", size: prominent ? 19 : 14, relativeTo: prominent ? .headline : .subheadline))
            .multilineTextAlignment(.leading)
        }
        .frame(maxWidth: .infinity, minHeight: prominent ? 76 : 52, alignment: .leading)
        .padding(.horizontal, 12).padding(.vertical, 6)
        .background(palette.surface, in: RoundedRectangle(cornerRadius: 16))
        .overlay { RoundedRectangle(cornerRadius: 16).strokeBorder(palette.border, lineWidth: 0.5) }
      }
    }
  }

  private struct Outcome: Equatable {
    let id: String
    let status: String
    let needsReview: Bool
  }

  private struct Load: Hashable { let cursor: String?; let attempt: Int }

  private func load(_ index: Int, _ cursor: String?) async {
    do {
      for try await page in backend.libraryPage(after: cursor) {
        guard !Task.isCancelled, subscriptions.indices.contains(index), subscriptions[index] == cursor else { return }
        failures.remove(index)
        if pages.count == index {
          pages.append(page)
        } else {
          if pages[index].continueCursor != page.continueCursor || page.isDone {
            pages.removeSubrange((index + 1)..<pages.count)
            failures = failures.filter { $0 <= index }
          }
          pages[index] = page
        }
      }
    } catch {
      if !Task.isCancelled, subscriptions.indices.contains(index), subscriptions[index] == cursor {
        failures.insert(index)
      }
    }
  }

  private func dayTitle(_ day: Date) -> String {
    if Calendar.current.isDateInToday(day) { return copy("homePlaces.today") }
    if Calendar.current.isDateInYesterday(day) { return copy("homePlaces.yesterday") }
    return day.formatted(date: .abbreviated, time: .omitted)
  }

}

struct LibrarySaveRow: View {
  let save: LibrarySave
  var featured = false
  @Environment(\.copy) private var copy
  var body: some View {
    HStack(spacing: featured ? 12 : nil) {
      if let source = save.imageUrl ?? save.heroImageUrl, let url = URL(string: source) {
        AsyncImage(url: url) { image in image.resizable().scaledToFill() } placeholder: { Color.secondary.opacity(0.1) }
          .frame(width: featured ? 62 : 48, height: featured ? 62 : 48)
          .clipShape(.rect(cornerRadius: featured ? 12 : 8))
          .accessibilityHidden(true)
      } else if featured {
        Image(systemName: "bookmark").font(.title3).foregroundStyle(Color(.muted))
          .frame(width: 62, height: 62).background(Color(.background), in: RoundedRectangle(cornerRadius: 12))
          .accessibilityHidden(true)
      }
      VStack(alignment: .leading, spacing: featured ? 4 : nil) {
        Text(save.name(copy: copy)).lineLimit(2)
          .font(featured ? .custom("Satoshi-Bold", size: 16, relativeTo: .body) : .body)
        Text(subtitle).font(featured ? .custom("Satoshi-Regular", size: 13, relativeTo: .caption) : .caption)
          .foregroundStyle(.secondary)
      }
    }
  }

  private var subtitle: String {
    if save.status == "processing" { return copy("homePlaces.noPlaceReading") }
    if let city = save.cities?.first, save.status == "ready" { return city }
    return copy(save.status == "failed" || save.enrichment == "partial" ? "homePlaces.reviewFailed" : "homePlaces.noPlaceNone")
  }
}
