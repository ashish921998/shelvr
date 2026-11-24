import ShelvrKit
import SwiftUI

struct PassportActions: View {
  let cities: [PassportCityStamp]?
  let hasPlaces: Bool
  @Environment(Backend.self) private var backend
  @Environment(\.copy) private var copy
  @State private var showCities = false
  @State private var activeToken: String?
  @State private var stopping = false
  @State private var busy = false
  @State private var failed = false
  @State private var subscriptionFailed = false
  @State private var subscriptions = 0
  @State private var retryOperation: (@MainActor () async throws -> Void)?


  var body: some View {
    Menu {
      Button(copy("cityStamps.add")) { showCities = true }.disabled(cities == nil)
      if hasPlaces {
        if let route = AppLink("/passport-story") {
          NavigationLink(copy("passportShare.share"), value: route)
        }
      }
      if subscriptionFailed { Button(copy("common.retry")) { subscriptions += 1 } }
      if activeToken != nil {
        Button(copy("passportShare.stopSetting"), role: .destructive) { stopping = true }
      }
    } label: {
      Image(systemName: "ellipsis.circle").accessibilityLabel(copy("passport.title"))
    }
    .disabled(busy)
    .sheet(isPresented: $showCities) {
      if let cities { PassportCityPicker(cities: cities) } else { ProgressView() }
    }
    .confirmationDialog(copy("passportShare.stopTitle"), isPresented: $stopping, titleVisibility: .visible) {
      Button(copy("passportShare.stop"), role: .destructive) {
        run { try await backend.stopPassportSharing() }
      }
      Button(copy("common.cancel"), role: .cancel) {}
    } message: { Text(copy("passportShare.stopBody")) }
    .alert(copy("errors.unexpectedTitle"), isPresented: $failed) {
      Button(copy("common.retry")) {
        if let retryOperation { run(retryOperation) }
      }
      Button(copy("common.close"), role: .cancel) { retryOperation = nil }
    }
    .task(id: subscriptions) {
      subscriptionFailed = false
      do {
        for try await token in backend.query("passportShares:myPassportShare", as: String?.self) {
          try Task.checkCancellation()
          activeToken = token
        }
      } catch { if !Task.isCancelled { subscriptionFailed = true } }
    }
  }

  private func run(_ action: @escaping @MainActor () async throws -> Void) {
    guard !busy else { return }
    busy = true
    Task {
      defer { busy = false }
      do { try await action(); retryOperation = nil }
      catch { retryOperation = action; failed = true }
    }
  }
}

struct PassportCityPicker: View {
  let cities: [PassportCityStamp]
  @Environment(Backend.self) private var backend
  @Environment(\.copy) private var copy
  @Environment(\.dismiss) private var dismiss
  @State private var operation = SocialOperation()
  @State private var search = ""

  var body: some View {
    let held = Set(cities.map(\.id))
    let choices = StampCity.catalog.filter { search.isEmpty || copy($0.labelKey).localizedStandardContains(search) }
    NavigationStack {
      List(choices) { city in
        let selected = held.contains(city.id)
        Button {
          operation.run { _ = try await backend.changeCityStamp(city.id, add: !selected) }
        } label: {
          HStack {
            Text(copy(city.labelKey))
            Spacer()
            if selected { Image(systemName: "checkmark.seal.fill") }
          }
        }
        .accessibilityAddTraits(selected ? .isSelected : [])
        .disabled(operation.busy)
      }
      .overlay { if choices.isEmpty { Text(copy("cityStamps.noMatch")) } }
      .searchable(text: $search)
      .navigationTitle(copy("cityStamps.title"))
      .toolbar {
        ToolbarItem(placement: .confirmationAction) { Button(copy("common.close")) { dismiss() } }
      }
      .socialOperation(operation, failure: copy("cityStamps.saveFailed"), close: copy("common.close"))
    }
  }
}
