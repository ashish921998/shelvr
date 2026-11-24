import ImageIO
import ShelvrKit
import SwiftUI

struct TripsTabView: View {
  @Environment(\.copy) private var copy
  @Environment(Backend.self) private var backend
  @State private var pages: [TripsPage] = []
  @State private var requested = 1
  @State private var pageFailures = Set<Int>()
  @State private var retry = 0
  @State private var removing: TripsPage.Trip?
  @State private var failed = false

  var body: some View {
    List {
      if let route = AppLink("/new-trip") {
        NavigationLink(value: route) { Label(copy("tripPlanner.planTrip"), systemImage: "plus") }
      }
      ForEach(rows) { trip in
        if let link = AppLink("/trip-plan/" + trip.id) {
          NavigationLink(value: link) {
            HStack {
              if let cover = trip.cover { TripCover(base64: cover) }
              VStack(alignment: .leading) {
                Text(trip.name ?? copy("tripPlanner.tripTitle", ["city": trip.city])).font(.headline)
                Text([trip.city, trip.startDate].compactMap { $0 }.joined(separator: " · "))
                  .font(.subheadline).foregroundStyle(.secondary)
              }
            }
          }.swipeActions {
            Button(role: .destructive) { removing = trip } label: { Label(copy("tripPlanner.delete"), systemImage: "trash") }
          }
        }
      }
      if !pageFailures.isEmpty { Button(copy("common.retry")) { pageFailures.removeAll(); retry += 1 } }
      else if let last = pages.last {
        if !last.isDone {
          ProgressView().onAppear { requested = pages.count + 1 }.id(last.continueCursor)
        } else if rows.isEmpty {
          ContentUnavailableView(copy("tripPlanner.emptyTitle"), systemImage: "airplane",
            description: Text(copy("tripPlanner.emptyBody")))
        }
      } else { ProgressView() }
    }
    .background {
      ZStack {
        ForEach(Array(cursors.enumerated()), id: \.offset) { index, cursor in
          Color.clear.task(id: Request(cursor: cursor, retry: retry)) { await load(index, cursor: cursor) }
        }
      }
    }
    .navigationTitle(copy("navigation.trips"))
    .confirmationDialog(copy("tripPlanner.deleteTitle"),
      isPresented: Binding(get: { removing != nil }, set: { if !$0 { removing = nil } }),
      titleVisibility: .visible, presenting: removing) { trip in
      Button(copy("tripPlanner.delete"), role: .destructive) {
        Task {
          do { try await backend.deleteTrip(trip.id) }
          catch { failed = true }
        }
      }
      Button(copy("common.cancel"), role: .cancel) {}
    } message: { _ in Text(copy("tripPlanner.deleteBody")) }
    .alert(copy("tripPlanner.deleteFailed"), isPresented: $failed) { Button(copy("common.close")) {} }
  }
  private struct Request: Hashable { let cursor: String?; let retry: Int }

  private var rows: [TripsPage.Trip] {
    var seen = Set<String>()
    return pages.flatMap { page in
      let next = page.newTrips(after: seen)
      seen.formUnion(next.map(\.id))
      return next
    }
  }

  private var cursors: [String?] {
    var list: [String?] = [nil]
    for page in pages.prefix(requested - 1) {
      guard !page.isDone, !list.contains(page.continueCursor) else { break }
      list.append(page.continueCursor)
    }
    return list
  }

  private func load(_ index: Int, cursor: String?) async {
    do {
      for try await page in backend.tripsPage(after: cursor) {
        guard !Task.isCancelled, cursors.indices.contains(index), cursors[index] == cursor else { return }
        if index == pages.count { pages.append(page) }
        else {
          if page.isDone || pages[index].continueCursor != page.continueCursor {
            pages.removeSubrange((index + 1)..<pages.count)
            pageFailures = pageFailures.filter { $0 <= index }
          }
          pages[index] = page
        }
      }
    } catch {
      if !Task.isCancelled, cursors.indices.contains(index), cursors[index] == cursor { pageFailures.insert(index) }
    }
  }
}

private struct TripCover: View {
  let base64: String
  @State private var image: UIImage?

  var body: some View {
    Group {
      if let image { Image(uiImage: image).resizable().scaledToFill() }
      else { Color.secondary.opacity(0.12) }
    }
    .frame(width: 64, height: 64)
    .clipShape(RoundedRectangle(cornerRadius: 10))
    .task(id: base64) {
      guard let data = Data(base64Encoded: base64),
        let source = CGImageSourceCreateWithData(data as CFData, nil),
        let thumbnail = CGImageSourceCreateThumbnailAtIndex(source, 0, [
          kCGImageSourceCreateThumbnailFromImageAlways: true,
          kCGImageSourceCreateThumbnailWithTransform: true,
          kCGImageSourceThumbnailMaxPixelSize: 192
        ] as CFDictionary) else { image = nil; return }
      image = UIImage(cgImage: thumbnail)
    }
  }
}
