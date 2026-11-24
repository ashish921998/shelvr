import ShelvrKit
import SwiftUI

struct LibraryView: View {
  enum Screen { case home, saves, review }
  let screen: Screen
  @Environment(Backend.self) private var backend
  @Environment(\.copy) private var copy
  @State private var pages: [LibraryPage] = []
  @State private var requested = 1
  @State private var failures: Set<Int> = []
  @State private var attempt = 0
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
    List {
      if screen == .home {
        if let id = unplacedID, rows.contains(where: { $0.id == id && $0.needsReview }),
          let destination = AppLink("/item/" + id) {
          HStack {
            NavigationLink(value: destination) {
              Label(copy("homePlaces.toastNoPlace"), systemImage: "mappin.slash")
            }
            Button { unplacedID = nil } label: { Image(systemName: "xmark") }
              .buttonStyle(.borderless).accessibilityLabel(copy("common.dismiss"))
          }
        }
        route("/saves", "homePlaces.allSaves", "bookmark")
        route("/cities", "homePlaces.cities", "building.2")
        route("/trips", "navigation.trips", "airplane")
        route("/collections", "homePlaces.collections", "person.2")
        route("/passport", "passport.title", "book.closed")
        if rows.contains(where: \.needsReview) || pages.last?.isDone == false {
          route("/review-saves", "homePlaces.withoutPlace", "exclamationmark.circle")
        }
      }
      if pages.isEmpty && failures.isEmpty { ProgressView() }
      if !pages.isEmpty {
        let visible = screen == .review ? rows.filter(\.needsReview) :
          (screen == .home ? Array(rows.filter { !$0.needsReview }.prefix(8)) : rows)
        if screen == .review && visible.isEmpty && pages.last?.isDone == true {
          ContentUnavailableView(copy("digest.emptyTitle"), systemImage: "checkmark.circle")
        } else if rows.isEmpty && screen != .review {
          ContentUnavailableView(copy("homePlaces.emptyTitle"), systemImage: "bookmark",
            description: Text(copy("homePlaces.emptyBody")))
        }
        if screen == .home && !visible.isEmpty { Text(copy("homePlaces.recents")).font(.headline) }
        ForEach(LibrarySave.days(visible), id: \.0) { day, saves in
          Section(dayTitle(day)) {
            ForEach(saves) { save in
              if let link = AppLink("/item/" + save.id) {
                NavigationLink(value: link) { LibrarySaveRow(save: save) }
              }
            }
          }
        }
        if screen != .home, let last = pages.last, !last.isDone, failures.isEmpty {
          ProgressView().onAppear { requested = pages.count + 1 }
            .id(last.continueCursor)
        }
      }
      if !failures.isEmpty {
        Button(copy("common.retry")) { failures.removeAll(); attempt += 1 }
      }
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

  private func route(_ path: String, _ title: String, _ symbol: String) -> some View {
    Group {
      if let link = AppLink(path) { NavigationLink(value: link) { Label(copy(title), systemImage: symbol) } }
    }
  }
}

struct LibrarySaveRow: View {
  let save: LibrarySave
  @Environment(\.copy) private var copy
  var body: some View {
    HStack {
      if let source = save.imageUrl ?? save.heroImageUrl, let url = URL(string: source) {
        AsyncImage(url: url) { image in image.resizable().scaledToFill() } placeholder: { Color.secondary.opacity(0.1) }
          .frame(width: 48, height: 48).clipShape(.rect(cornerRadius: 8))
      }
      VStack(alignment: .leading) {
        Text(save.name(copy: copy)).lineLimit(2)
        Text(subtitle).font(.caption).foregroundStyle(.secondary)
      }
    }
  }

  private var subtitle: String {
    if save.status == "processing" { return copy("homePlaces.noPlaceReading") }
    if let city = save.cities?.first, save.status == "ready" { return city }
    return copy(save.status == "failed" || save.enrichment == "partial" ? "homePlaces.reviewFailed" : "homePlaces.noPlaceNone")
  }
}
