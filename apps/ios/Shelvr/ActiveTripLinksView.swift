import Combine
import ConvexMobile
import ShelvrKit
import SwiftUI

struct ActiveTripLinksView: View {
  struct Page: Decodable {
    struct Trip: Decodable { let _id, city: String; let name: String? }
    let page: [Trip]
    let isDone: Bool
    let continueCursor: String
  }
  @Environment(Backend.self) private var backend
  @Environment(\.copy) private var copy
  @State private var cursor: String?
  @State private var page: Page?
  @State private var failed = false
  @State private var attempt = 0

  var body: some View {
    List {
      if failed { Button(copy("common.retry")) { attempt += 1 } }
      else if let page {
        ForEach(page.page, id: \._id) { trip in
          NavigationLink(trip.name ?? trip.city) { TripRevocationView(id: trip._id) }
        }
        if !page.isDone { Button(copy("tripShare.more")) { cursor = page.continueCursor } }
        if cursor != nil { Button(copy("common.back")) { cursor = nil } }
      } else { ProgressView() }
    }
    .navigationTitle(copy("tripShare.manage"))
    .task(id: [cursor ?? "", String(attempt)]) {
      page = nil; failed = false
      let options: [String: ConvexEncodable?] = ["numItems": 25.0, "cursor": cursor]
      do {
        for try await next in backend.client.subscribe(to: "tripShares:listSharedTrips", with: ["paginationOpts": options],
          yielding: Page.self).values { try Task.checkCancellation(); page = next }
      } catch { if !Task.isCancelled { failed = true } }
    }
  }
}

struct TripRevocationView: View {
  let id: String
  @Environment(Backend.self) private var backend
  @Environment(\.copy) private var copy
  @Environment(\.dismiss) private var dismiss
  @State private var confirming: String?
  @State private var failed = false

  var body: some View {
    SocialQuery(query: "tripShares:getShareToken", arguments: ["tripId": id], type: String?.self) { token in
      if let token {
        VStack(spacing: 16) {
          Text(copy("tripShare.active"))
          Button(copy("tripShare.revoke"), role: .destructive) { confirming = token }
          if failed { Text(copy("errors.tryAgain")) }
        }
      } else { Text(copy("planGate.body")) }
    }
    .alert(copy("tripShare.revoke"), isPresented: Binding(get: { confirming != nil }, set: { if !$0 { confirming = nil } }),
      presenting: confirming) { token in
      Button(copy("common.cancel"), role: .cancel) {}
      Button(copy("tripShare.revoke"), role: .destructive) {
        Task {
          do {
            try await backend.client.mutation("tripShares:revokeShare", with: ["tripId": id, "token": token])
            dismiss()
          } catch { failed = true }
        }
      }
    } message: { _ in Text(copy("tripShare.revokeBody")) }
    .padding()
  }
}
