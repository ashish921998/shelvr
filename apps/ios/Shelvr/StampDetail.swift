import ShelvrKit
import SwiftUI

struct StampDetail: View {
  let stamp: PassportStamp
  let finish: (String?) -> Void
  @Environment(Backend.self) private var backend
  @Environment(\.copy) private var copy
  @State private var remove = false
  @State private var operation = SocialOperation()

  var body: some View {
    NavigationStack {
      List {
        if let url = stamp.cover.flatMap(URL.init(string:)) {
          AsyncImage(url: url) { image in image.resizable().scaledToFit() }
            placeholder: { ProgressView() }
            .accessibilityLabel(copy("passport.coverCredit"))
        }
        Section {
          if let city = stamp.city { LabeledContent(copy("homePlaces.cities"), value: city) }
          if let date = stamp.date { LabeledContent(copy("passport.wentNoDate"), value: date.formatted(date: .long, time: .omitted)) }
          else { Text(copy("passport.wentNoDate")) }
          if let item = stamp.itemId {
            Button(copy("trip.openSave")) { finish("/item/" + item) }
          }
          if let city = stamp.city {
            Button(copy("passport.shareCity", ["city": city])) {
              var url = URLComponents()
              url.path = "/passport-card"
              url.queryItems = [.init(name: "city", value: city), .init(name: "surface", value: "stamp")]
              finish(url.string)
            }
          }
        }
        Button(copy("passport.removeStamp"), role: .destructive) { remove = true }.disabled(operation.busy)
      }
      .navigationTitle(stamp.name)
      .toolbar {
        ToolbarItem(placement: .confirmationAction) { Button(copy("common.close")) { finish(nil) } }
      }
      .confirmationDialog(copy("passport.removeStamp"), isPresented: $remove, titleVisibility: .visible) {
        Button(copy("passport.removeStamp"), role: .destructive) {
          operation.run {
            try await backend.removePassportStamp(stamp)
            finish(nil)
          }
        }
        Button(copy("common.cancel"), role: .cancel) {}
      } message: { Text(stamp.name) }
      .socialOperation(operation, failure: copy("errors.tryAgain"), close: copy("common.close"))
    }.presentationDetents([.medium, .large])
  }
}
