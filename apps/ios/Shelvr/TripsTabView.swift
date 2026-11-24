import ImageIO
import ShelvrKit
import SwiftUI

struct TripsTabView: View {
  @Environment(\.copy) private var copy
  @Environment(Backend.self) private var backend
  @State private var removing: TripsPage.Trip?
  @State private var failed = false

  var body: some View {
    List {
      if let route = AppLink("/new-trip") {
        NavigationLink(value: route) { Label(copy("tripPlanner.planTrip"), systemImage: "plus") }
      }
      TripPageRows(cursor: nil, seen: []) { removing = $0 }
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
}

private struct TripPageRows: View {
  let cursor: String?
  let seen: Set<String>
  let remove: (TripsPage.Trip) -> Void
  @Environment(Backend.self) private var backend
  @Environment(\.copy) private var copy
  @State private var page: TripsPage?
  @State private var next = false
  @State private var failed = false
  @State private var retry = 0

  var body: some View {
    Group {
      if let page {
        let rows = page.newTrips(after: seen)
        ForEach(rows) { trip in
          if let link = AppLink("/trip-plan/" + trip.id) {
            NavigationLink(value: link) {
              HStack {
                if let cover = trip.cover {
                  TripCover(base64: cover)
                }
                VStack(alignment: .leading) {
                  Text(trip.name ?? copy("tripPlanner.tripTitle", ["city": trip.city])).font(.headline)
                  Text([trip.city, trip.startDate].compactMap { $0 }.joined(separator: " · "))
                    .font(.subheadline).foregroundStyle(.secondary)
                }
              }
            }.swipeActions {
              Button(role: .destructive) { remove(trip) } label: { Label(copy("tripPlanner.delete"), systemImage: "trash") }
            }
          }
        }
        if !page.isDone, cursor != page.continueCursor {
          if next {
            TripPageRows(cursor: page.continueCursor, seen: seen.union(rows.map(\.id)), remove: remove)
              .id(page.continueCursor)
          } else { ProgressView().onAppear { next = true } }
        } else if cursor == nil, rows.isEmpty {
          ContentUnavailableView(copy("tripPlanner.emptyTitle"), systemImage: "airplane",
            description: Text(copy("tripPlanner.emptyBody")))
        }
      } else if !failed { ProgressView() }
      if failed { Button(copy("common.retry")) { retry += 1 } }
    }
    .task(id: retry) {
      failed = false
      do {
        for try await response in backend.tripsPage(after: cursor) {
          try Task.checkCancellation()
          page = response
        }
      } catch { if !Task.isCancelled { failed = true } }
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
