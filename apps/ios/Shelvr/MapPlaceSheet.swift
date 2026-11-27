import Contacts
import MapKit
import ShelvrKit
import SwiftUI

struct MapPlaceSheet: View {
  let place: MapPlace
  let todayHours: PlaceDayHours?

  @Environment(Backend.self) private var backend
  @Environment(\.copy) private var copy
  @Environment(\.dismiss) private var dismiss
  @Environment(\.colorScheme) private var scheme
  @Environment(\.dynamicTypeSize) private var typeSize
  @Environment(\.locale) private var locale
  @AppStorage("swift.appearance") private var appearance = "system"
  @State private var contentHeight: CGFloat = 156
  @State private var lookup = Lookup.loading
  @State private var mapsRequestSession: UUID?
  @State private var mapsUnavailable = false

  private enum Lookup {
    case loading, finished(MKMapItem?, session: UUID)

    func streetAddress(in session: UUID) -> String? {
      guard case let .finished(item?, resolvedSession) = self, resolvedSession == session else { return nil }
      return item.placemark.postalAddress?.street
    }
  }

  var body: some View {
    let palette = HomeChromePalette(scheme, appearance: appearance)
    ScrollView {
      TimelineView(.everyMinute) { time in
        VStack(alignment: .leading, spacing: 14) {
          heading(palette)
          placeFacts(palette, hours: todayHours?.display(on: time.date, locale: locale))
          mapsButton
        }
      }
      .padding(.horizontal, 20)
      .padding(.top, 20)
      .padding(.bottom, 16)
      .onGeometryChange(for: CGFloat.self) { $0.size.height.rounded(.up) } action: { contentHeight = $0 }
    }
    .scrollBounceBehavior(.basedOnSize)
    .foregroundStyle(palette.foreground)
    .background(palette.background.ignoresSafeArea())
    .presentationDetents(typeSize.isAccessibilitySize ? [.large] : [.height(min(contentHeight, 440)), .large])
    .presentationDragIndicator(.visible)
    .task(id: backend.sessionGeneration) { await loadMapItem() }
    .alert(copy("common.unavailable"), isPresented: $mapsUnavailable) { Button(copy("common.close")) {} }
  }

  @ViewBuilder private func placeFacts(_ palette: HomeChromePalette, hours: PlaceDayHours.Display?) -> some View {
    let address = lookup.streetAddress(in: backend.sessionGeneration)?.trimmingCharacters(in: .whitespacesAndNewlines)
    if address?.isEmpty == false || hours != nil {
      VStack(alignment: .leading, spacing: 8) {
        if let address, !address.isEmpty { Label(address, systemImage: "mappin") }
        switch hours {
        case .closed: Label(copy("map.closedToday"), systemImage: "clock")
        case .allDay: Label(copy("map.openAllDay"), systemImage: "clock")
        case let .ranges(text):
          Label(copy("map.hoursToday", ["hours": text]), systemImage: "clock")
        case nil: EmptyView()
        }
      }
      .font(.subheadline)
      .foregroundStyle(palette.muted)
      .fixedSize(horizontal: false, vertical: true)
    }
  }

  private func heading(_ palette: HomeChromePalette) -> some View {
    let context = [place.kinds.first.map { copy($0.labelKey) }, place.city].compactMap { $0 }
    return HStack(alignment: .top, spacing: 10) {
      VStack(alignment: .leading, spacing: 4) {
        Text(place.name)
          .font(.custom("Satoshi-Bold", size: 28, relativeTo: .title))
          .accessibilityAddTraits(.isHeader)
          .fixedSize(horizontal: false, vertical: true)
        if !context.isEmpty {
          Text(context.joined(separator: " · "))
            .font(.subheadline)
            .foregroundStyle(palette.muted)
        }
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      Button { dismiss() } label: {
        Image(systemName: "xmark")
          .font(.subheadline.weight(.semibold))
          .frame(width: 44, height: 44)
          .background(palette.surface, in: Circle())
          .contentShape(Circle())
      }
      .buttonStyle(HomeChromePressStyle())
      .accessibilityLabel(copy("common.close"))
    }
  }

  private var mapsButton: some View {
    let shape = RoundedRectangle(cornerRadius: 15)
    let openingMaps = mapsRequestSession == backend.sessionGeneration
    return Button(action: requestMaps) {
      Label(copy("plan.openMaps"), systemImage: "map")
        .font(.subheadline.weight(.semibold))
        .multilineTextAlignment(.center)
        .fixedSize(horizontal: false, vertical: true)
        .padding(.horizontal, 10)
        .padding(.vertical, 8)
        .frame(maxWidth: .infinity, minHeight: 48)
        .foregroundStyle(.black)
        .background(Color("AccentColor"), in: shape)
        .contentShape(shape)
    }
    .buttonStyle(HomeChromePressStyle())
    .disabled(openingMaps)
    .opacity(openingMaps ? 0.65 : 1)
  }

  private func requestMaps() {
    guard backend.userID != nil else { return }
    let session = backend.sessionGeneration
    if case let .finished(item, resolvedSession) = lookup, resolvedSession == session { openMaps(item) }
    else { mapsRequestSession = session }
  }

  private func loadMapItem() async {
    lookup = .loading
    guard let owner = backend.userID else { return }
    let session = backend.sessionGeneration
    let resolved: MKMapItem?
    if let raw = place.appleId, let identifier = MKMapItem.Identifier(rawValue: raw) {
      resolved = try? await MKMapItemRequest(mapItemIdentifier: identifier).mapItem
    } else {
      resolved = nil
    }
    guard !Task.isCancelled, backend.userID == owner, backend.sessionGeneration == session else { return }
    lookup = .finished(resolved, session: session)
    if mapsRequestSession == session { openMaps(resolved) }
  }

  private func openMaps(_ resolved: MKMapItem?) {
    defer { mapsRequestSession = nil }
    if let resolved {
      mapsUnavailable = !resolved.openInMaps()
      return
    }
    let item: MKMapItem
    if #available(iOS 26.0, *) {
      item = MKMapItem(location: CLLocation(latitude: place.lat, longitude: place.lng), address: nil)
    } else {
      item = MKMapItem(placemark: MKPlacemark(coordinate: place.coordinate))
    }
    item.name = place.name
    mapsUnavailable = !item.openInMaps()
  }
}
