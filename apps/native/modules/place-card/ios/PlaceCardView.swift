import CoreLocation
import ExpoModulesCore
import GooglePlacesSwift
import SwiftUI
import UIKit

private struct CardHeight: PreferenceKey {
  static var defaultValue: CGFloat = 0
  static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) { value = nextValue() }
}

private struct GoogleCard: View {
  @State var query: PlaceDetailsQuery
  let status: (String) -> Void
  let height: (CGFloat) -> Void

  var body: some View {
    PlaceDetailsCompactView(
      orientation: .horizontal,
      query: $query,
      configuration: PlaceDetailsCompactConfiguration(
        content: [.media(lightbox: true), .address()],
        preferTruncation: false,
        theme: PlacesMaterialTheme()
      ),
      placeDetailsCallback: { result in
        if result.place != nil { status("ready") }
        else if result.error != nil { status("unavailable") }
      }
    )
    .fixedSize(horizontal: false, vertical: true)
    .background(GeometryReader { proxy in Color.clear.preference(key: CardHeight.self, value: proxy.size.height) })
    .onPreferenceChange(CardHeight.self, perform: height)
  }
}

class PlaceCardView: ExpoView {
  var placeName = ""
  var city = ""
  var latitude = Double.nan
  var longitude = Double.nan
  let onStatus = EventDispatcher()
  let onHeight = EventDispatcher()
  private var signature = ""
  private var task: Task<Void, Never>?
  private var host: UIHostingController<GoogleCard>?
  private static var configured = false

  override func layoutSubviews() {
    super.layoutSubviews()
    host?.view.frame = bounds
  }

  override func didMoveToWindow() {
    super.didMoveToWindow()
    if window == nil {
      task?.cancel()
      task = nil
      signature = ""
      removeCard()
    } else {
      loadPlace()
    }
  }

  func loadPlace() {
    guard window != nil, !placeName.isEmpty, latitude.isFinite, longitude.isFinite else { return }
    let next = "\(placeName):\(city):\(latitude):\(longitude)"
    guard next != signature else { return }
    signature = next
    task?.cancel()
    removeCard()
    guard let key = Bundle.main.object(forInfoDictionaryKey: "ShelvrGooglePlacesApiKey") as? String, !key.isEmpty else {
      onStatus(["status": "unavailable"])
      return
    }
    if !Self.configured { Self.configured = PlacesClient.provideAPIKey(key) }
    guard Self.configured else { onStatus(["status": "unavailable"]); return }

    let name = placeName
    let sourceCity = city
    let lat = latitude
    let lng = longitude
    task = Task { @MainActor [weak self] in
      let request = SearchByTextRequest(
        textQuery: name,
        placeProperties: [.placeID, .displayName, .coordinate],
        locationBias: CircularCoordinateRegion(center: CLLocationCoordinate2D(latitude: lat, longitude: lng), radius: 250),
        maxResultCount: 3,
        isOpenNow: false
      )
      let response = await PlacesClient.shared.responseForSearchByText(with: request)
      guard !Task.isCancelled, let self, self.signature == next else { return }
      guard case .success(let result) = response, let places = result.places,
        let index = PlaceCardMatch.uniqueIndex(expected: name, city: sourceCity, lat: lat, lng: lng,
          candidates: places.map { PlaceCardMatch.Candidate(name: $0.displayName ?? "", lat: $0.location.latitude, lng: $0.location.longitude) }),
        let id = places[index].placeID else {
        self.onStatus(["status": "unavailable"])
        return
      }
      self.showCard(id: id, signature: next)
    }
  }

  private func showCard(id: String, signature: String) {
    let card = GoogleCard(query: PlaceDetailsQuery(identifier: .placeID(id)), status: { [weak self] status in
      guard let self, self.signature == signature else { return }
      self.onStatus(["status": status])
    }, height: { [weak self] height in
      guard let self, self.signature == signature, height.isFinite, height > 0 else { return }
      self.onHeight(["height": ceil(height)])
    })
    let controller = UIHostingController(rootView: card)
    controller.view.backgroundColor = .clear
    if let parent = appContext?.utilities?.currentViewController() {
      parent.addChild(controller)
      addSubview(controller.view)
      controller.didMove(toParent: parent)
    } else {
      onStatus(["status": "unavailable"])
      return
    }
    host = controller
    setNeedsLayout()
  }

  private func removeCard() {
    host?.willMove(toParent: nil)
    host?.view.removeFromSuperview()
    host?.removeFromParent()
    host = nil
  }
}
