import ImageIO
import MapKit
import PhotosUI
import ShelvrKit
import SwiftUI

struct BlankTripView: View {
  let generate: (String) -> Void
  let created: (AppLink) -> Void
  @Environment(Backend.self) private var backend
  @Environment(\.copy) private var copy
  @State private var name: String
  @State private var city: String
  @State private var countries = [String]()
  @State private var choosing = false
  @State private var countryQuery = ""
  @State private var dated = true
  @State private var start = Date()
  @State private var end = Calendar.current.date(byAdding: .day, value: 6, to: .now) ?? .now
  @State private var days = 5
  @State private var stayStage = false
  @State private var hotel = ""
  @State private var hotels = [TripSearchPlace]()
  @State private var pickingPin = false
  @State private var savedCenter: CLLocationCoordinate2D?
  @State private var cityCenter: CLLocationCoordinate2D?
  @State private var picked: PhotosPickerItem?
  @State private var cover: Data?
  @State private var loadingCover = false
  @State private var message = ""
  @State private var busy = false
  @State private var request: Task<Void, Never>?

  init(city: String, generate: @escaping (String) -> Void, created: @escaping (AppLink) -> Void) {
    _city = State(initialValue: city)
    _name = State(initialValue: city)
    self.generate = generate
    self.created = created
  }

  var body: some View {
    Form {
      if stayStage { stayForm } else {
        let selectedCover = cover
        let coverLabel = copy("tripSetup.cover")
        PhotosPicker(selection: $picked, matching: .images) {
          if let selectedCover, let image = UIImage(data: selectedCover) {
            Image(uiImage: image).resizable().scaledToFit().frame(maxHeight: 150)
          } else { Label(coverLabel, systemImage: "photo") }
        }
        TextField(copy("tripPlanner.nameLabel"), text: $name)
          .onChange(of: name) { _, value in
            if value.utf16.count > 80 { name = BlankTrip.limitedName(value) }
          }
        Button { choosing = true } label: {
          LabeledContent(copy("tripSetup.chooseCountries"), value: countries.map(countryName).joined(separator: ", "))
        }
        TextField(copy("tripSetup.baseCity"), text: $city)
        Toggle(copy("tripSetup.useDates"), isOn: $dated)
        if dated {
          DatePicker(copy("tripSetup.startDate"), selection: $start, in: Calendar.current.startOfDay(for: .now)..., displayedComponents: .date)
          DatePicker(copy("tripSetup.endDate"), selection: $end, in: start...(Calendar.current.date(byAdding: .day, value: 14, to: start) ?? start), displayedComponents: .date)
        } else { Stepper(value: $days, in: 1...15) { LabeledContent(copy("trip.howManyDays"), value: days.formatted()) } }
        Button(copy("tripSetup.start")) { message = ""; stayStage = true }.disabled(!valid || loadingCover)
        Button(copy("tripSetup.generate")) { generate(city) }
      }
      if !message.isEmpty { Text(message) }
    }
    .disabled(busy).navigationTitle(copy(stayStage ? "tripPlanner.stay" : "tripSetup.title"))
    .onChange(of: start) { _, date in
      let max = Calendar.current.date(byAdding: .day, value: 14, to: date) ?? date
      end = min(max, Swift.max(date, end))
    }
    .task(id: picked) {
      guard let picked else { return }
      loadingCover = true
      defer { if !Task.isCancelled { loadingCover = false } }
      do {
        guard let data = try await picked.loadTransferable(type: Data.self), let image = Self.coverData(data) else { throw CocoaError(.fileReadCorruptFile) }
        guard !Task.isCancelled else { return }
        cover = image; message = ""
      } catch { if !Task.isCancelled { message = copy("tripSetup.coverFailed") } }
    }
    .task(id: stayStage) {
      guard stayStage else { return }
      savedCenter = nil; cityCenter = nil
      let selectedCity = city.trimmingCharacters(in: .whitespacesAndNewlines)
      guard !selectedCity.isEmpty else { return }
      do {
        for try await saves in backend.citySaves(selectedCity) {
          let points = CityPlace.pins(in: saves)
          if !points.isEmpty {
            let count = Double(points.count)
            savedCenter = .init(latitude: points.map(\.lat).reduce(0, +) / count, longitude: points.map(\.lng).reduce(0, +) / count)
          } else {
            struct Location: Decodable { let lat: Double; let lng: Double }
            struct Match: Decodable { let locality: String; let location: Location? }
            let matches: [Match] = try await backend.client.action("tripPlanner:searchTripCities", with: ["query": selectedCity, "locale": copy.locale])
            if !Task.isCancelled, let point = matches.first(where: { $0.locality.localizedCaseInsensitiveCompare(selectedCity) == .orderedSame })?.location {
              cityCenter = .init(latitude: point.lat, longitude: point.lng)
            }
          }
          return
        }
      } catch {}
    }
    .onDisappear { request?.cancel() }
    .sheet(isPresented: $choosing) {
      NavigationStack {
        List(BlankTrip.countryCodes.filter { countryQuery.isEmpty || countryName($0).localizedCaseInsensitiveContains(countryQuery) }
          .sorted { countryName($0).localizedStandardCompare(countryName($1)) == .orderedAscending }, id: \.self) { code in
          Button {
            if countries.contains(code) { countries.removeAll { $0 == code } }
            else if countries.count < 12 { countries.append(code) }
          } label: { HStack { Text(countryName(code)); Spacer(); if countries.contains(code) { Image(systemName: "checkmark") } } }
        }
        .searchable(text: $countryQuery, prompt: copy("tripSetup.searchCountries"))
        .navigationTitle(copy("tripSetup.countries")).toolbar { Button(copy("common.done")) { choosing = false } }
      }
    }
  }

  @ViewBuilder private var stayForm: some View {
    TextField(copy("tripSetup.searchHotel"), text: $hotel)
      .task(id: hotel) {
        hotels = []
        let query = hotel.trimmingCharacters(in: .whitespacesAndNewlines)
        guard query.count >= 2 else { return }
        do {
          try await Task.sleep(for: .milliseconds(300))
          let match = try await backend.tripStays(query, countries: countries, city: city, locale: copy.locale)
          guard !Task.isCancelled else { return }
          hotels = match.places
          message = match.places.isEmpty ? copy(match.available ? "tripPlanner.searchEmpty" : "tripPlanner.searchUnavailable") : ""
        } catch { if !Task.isCancelled { message = copy("errors.retrySoon") } }
      }
    ForEach(Array(hotels.enumerated()), id: \.offset) { _, place in
      Button { submit(place) } label: { VStack(alignment: .leading) {
        Text(place.name)
        if let area = place.area { Text(area).font(.caption) }
      } }
    }
    if let savedCenter {
      Button(copy("tripSetup.stayNearSaves")) { submit(.init(name: city, lat: savedCenter.latitude, lng: savedCenter.longitude)) }
    }
    Button(copy("tripSetup.dropPin")) { pickingPin = true }
    Button(copy("tripSetup.decideLater")) { submit(nil) }
    Button(copy("common.back")) { stayStage = false }
    .sheet(isPresented: $pickingPin) {
      TripStayPin(center: savedCenter ?? cityCenter) { place in pickingPin = false; submit(place) }
    }
  }

  private var valid: Bool {
    let count = dated ? BlankTrip.dayCount(start: start, end: end) : days
    return !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && name.utf16.count <= 80 && !countries.isEmpty && (1...15).contains(count)
  }

  private func countryName(_ code: String) -> String {
    Locale(identifier: copy.locale).localizedString(forRegionCode: code) ?? code
  }

  private func submit(_ stay: TripSearchPlace?) {
    guard !busy, valid else { return }
    busy = true
    request = Task {
      defer { busy = false }
      do {
        let count = dated ? BlankTrip.dayCount(start: start, end: end) : days
        let id = try await backend.createBlankTrip(name: name, countries: countries, city: city, days: count,
          start: dated ? start : nil, stay: stay, cover: cover?.base64EncodedString())
        Analytics.capture("trip_blank_created", ["days": count, "dated": dated, "has_stay": stay != nil])
        if !Task.isCancelled, let link = AppLink("/trip-plan/" + id) { created(link) }
      } catch { if !Task.isCancelled { message = copy("tripPlanner.editFailed") } }
    }
  }

  private static func coverData(_ data: Data) -> Data? {
    guard let source = CGImageSourceCreateWithData(data as CFData, nil) else { return nil }
    for size in [640, 400, 240] {
      let options: [CFString: Any] = [kCGImageSourceCreateThumbnailFromImageAlways: true, kCGImageSourceCreateThumbnailWithTransform: true, kCGImageSourceThumbnailMaxPixelSize: size]
      if let thumbnail = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary),
        let jpeg = UIImage(cgImage: thumbnail).jpegData(compressionQuality: 0.68), jpeg.count <= 72_000 { return jpeg }
    }
    return nil
  }
}

private struct TripStayPin: View {
  let center: CLLocationCoordinate2D?
  let choose: (TripSearchPlace) -> Void
  @Environment(\.copy) private var copy
  @State private var point: CLLocationCoordinate2D?
  var body: some View {
    NavigationStack {
      MapReader { proxy in
        Map(initialPosition: center.map { .region(MKCoordinateRegion(center: $0, latitudinalMeters: 9_000, longitudinalMeters: 9_000)) } ?? .automatic) {
          if let point { Marker(copy("tripSetup.mapPin"), coordinate: point) }
        }.onTapGesture { location in point = proxy.convert(location, from: .local) }
      }
      .safeAreaInset(edge: .bottom) {
        Button(copy("tripSetup.usePin")) {
          if let point { choose(.init(name: copy("tripSetup.mapPin"), lat: point.latitude, lng: point.longitude)) }
        }.disabled(point == nil).buttonStyle(.borderedProminent).padding()
      }
      .navigationTitle(copy("tripSetup.dropPin"))
    }
  }
}
