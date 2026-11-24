import MapKit
import ShelvrKit
import SwiftUI

struct SignedInView: View {
  @Binding var pendingLink: AppLink?
  @Environment(\.copy) private var copy
  @State private var library = false
  @State private var path: [AppLink] = []
  @State private var namePrompts = MemberNamePrompts()
  @State private var stampMessage: String?

  var body: some View {
    NavigationStack(path: $path) {
      Group {
        if library {
          LibraryView(screen: .home)
        } else {
          SavedPlacesMap(open: open)
        }
      }
      .navigationTitle(copy(library ? "navigation.library" : "navigation.map"))
      .toolbar {
        ToolbarItem(placement: .topBarTrailing) {
          Button { open("/profile") } label: {
            Label(copy("navigation.profile"), systemImage: "person.crop.circle")
          }
        }
      }
      .safeAreaInset(edge: .bottom) {
        HStack {
          Button { library.toggle() } label: {
            Label(copy(library ? "navigation.map" : "navigation.library"),
              systemImage: library ? "map.fill" : "books.vertical.fill")
          }
          Spacer()
          Button { open("/add-spots") } label: {
            Image(systemName: "plus").font(.title2.bold()).frame(width: 54, height: 54)
              .background(.regularMaterial, in: Circle())
          }
          .accessibilityLabel(copy("common.add"))
          Spacer()
          Button { open("/go-out") } label: {
            Label(copy("plan.goOut"), systemImage: "figure.walk")
          }
        }
        .labelStyle(.titleAndIcon)
        .font(.subheadline.weight(.medium))
        .padding(.horizontal, 20)
        .padding(.vertical, 6)
        .background(.thinMaterial)
      }
      .navigationDestination(for: AppLink.self) { link in
        switch link.path.first {
        case "settings": AccountSettingsView()
        case "profile": AccountView().navigationTitle(copy("navigation.profile"))
        case "add-spots":
          List {
            entry("/add", "addSheet.pasteLink", "link")
            entry("/photo", "item.photo", "photo")
            entry("/how-to-share", "addSheet.howToShare", "square.and.arrow.up")
            entry("/save-with-siri", "addSheet.saveWithSiri", "mic")
          }
          .navigationTitle(copy("addSheet.title"))
        case "trips": TripsTabView()
        case "shared-lists", "collections": SharedListsView(collections: link.path.first == "collections")
        case "new-shared-list":
          CreateListView { id in
            guard path.last == link, let target = AppLink("/shared-list/" + id) else { return }
            path.removeLast()
            path.append(target)
          }
        case "shared-list" where link.path.count == 2:
          SharedListView(id: link.path[1], joined: link.query.contains { $0.name == "joined" && $0.value == "1" }).id(link)
        case "list-invite" where link.path.count == 2:
          JoinListView(token: link.path[1]) { route in
            if path.last == link, let target = AppLink(route) { path = [target] }
          }
        case "passport-invite" where link.path.count == 2: FriendPassportView(token: link.path[1]).id(link.path[1])
        case "already-been", "next-to-stamp":
          StampPlacesView(city: link.path.first == "next-to-stamp" ? link.query.first { $0.name == "city" }?.value ?? "" : nil) { message in
            guard path.last == link, let passport = AppLink("/passport") else { return }
            if let i = path.lastIndex(of: passport) { path = Array(path.prefix(i + 1)) }
            else { path = [passport] }
            stampMessage = message
          }.id(link)
        case "city-stamps":
          SocialQuery(query: "cityStamps:listCityStamps", type: [PassportCityStamp].self) { PassportCityPicker(cities: $0) }
        case "city-card":
          if let city = link.query.first(where: { $0.name == "city" })?.value { CityMapCardView(city: city).id(city) }
          else { LibraryCitiesView() }
        case "add-list-place":
          if let id = link.query.first(where: { $0.name == "listId" })?.value {
            SocialQuery(query: "sharedLists:getSharedList", arguments: ["listId": id], type: SharedListDetail?.self) { list in
              if let list { AddListPlaceView(detail: list, initialCity: link.query.first { $0.name == "city" }?.value) }
              else { ContentUnavailableView(copy("sharedLists.goneTitle"), systemImage: "person.2") }
            }.id(link)
          } else { SharedListsView() }
        case "passport-story": PassportStoryView()
        case "passport": PassportView(open: open)
        case "passport-card": PassportView(cardCity: link.query.first { $0.name == "city" }?.value)
        case "add": PasteLinkView()
        case "saves": LibraryView(screen: .saves)
        case "review-saves": LibraryView(screen: .review)
        case "city" where link.path.count == 2: CityPlacesView(city: link.path[1]).id(link.path[1])
        case "cities": LibraryCitiesView()
        case "item" where link.path.count == 2: LibraryItemView(id: link.path[1])
        case "edit-save-places":
          if let id = link.query.first(where: { $0.name == "itemId" })?.value {
            LibraryPlaceEditor(id: id).id(id)
          } else { ShellDestination(link: link) }
        case "date-plan", "go-out", "new-trip":
          if let city = link.query.first(where: { $0.name == "city" })?.value, !city.isEmpty {
            let listID = link.query.first(where: { $0.name == "listId" })?.value
            if link.path.first == "new-trip" {
              NewCityTripView(city: city, listID: listID) { created in
                guard path.last == link else { return }
                path[path.count - 1] = created
              }.id(link)
            } else { CityDateView(city: city, listID: listID).id(link) }
          } else { PlanCityView(trip: link.path.first == "new-trip") }
        case "add-trip-stop":
          if let id = link.query.first(where: { $0.name == "tripId" })?.value {
            let day = link.query.first(where: { $0.name == "day" })?.value.flatMap(Int.init) ?? 1
            AddTripStopView(id: id, initialDay: day).id(link)
          } else { ShellDestination(link: link) }
        case "trip-plan" where link.path.count == 2: CityTripView(id: link.path[1]).id(link.path[1])
        case "photo": PhotoSaveView()
        case "how-to-share": SaveInstructions(siri: false)
        case "save-with-siri": SaveInstructions(siri: true)
        default: ShellDestination(link: link)
        }
      }
    }
    .environment(namePrompts)
    .alert(copy("passport.stampedTitle"), isPresented: Binding(get: { stampMessage != nil }, set: { if !$0 { stampMessage = nil } })) {
      Button(copy("common.close")) {}
    } message: { Text(stampMessage ?? "") }
    .modifier(CancelSurveyCard(home: library && path.isEmpty))
    .modifier(TrialReminderObserver(home: path.isEmpty))
    .onChange(of: pendingLink, initial: true) { _, link in
      guard let link else { return }
      pendingLink = nil
      switch link.path {
      case ["map"]: library = false; path = []
      case ["home"]: library = true; path = []
      case ["sign-in"]: break
      default: path = [link]
      }
    }
  }

  private func open(_ route: String) {
    if let link = AppLink(route) { path.append(link) }
  }

  private func entry(_ route: String, _ title: String, _ symbol: String) -> some View {
    Button { open(route) } label: { Label(copy(title), systemImage: symbol) }
  }
}

private struct ShellDestination: View {
  let link: AppLink
  @Environment(\.copy) private var copy

  var body: some View {
    let titles = ["saves": "homePlaces.allSaves", "cities": "homePlaces.cities",
      "add": "addSheet.pasteLink", "how-to-share": "addSheet.howToShare",
      "save-with-siri": "addSheet.saveWithSiri", "passport": "passport.title",
      "trips": "navigation.trips", "date-plan": "homePlaces.planDate"]
    ContentUnavailableView(copy("common.unavailable"), systemImage: "rectangle.dashed")
      .navigationTitle(titles[link.path.first ?? ""].map { copy($0) } ?? "")
  }
}

private struct PlanCityView: View {
  let trip: Bool
  struct City: Decodable {
    let city: String
    let placeCount: Int?
  }
  @Environment(Backend.self) private var backend
  @Environment(\.copy) private var copy
  @State private var cities: [City]?
  @State private var failed = false
  @State private var attempt = 0

  var body: some View {
    Group {
      if failed {
        Button(copy("common.retry")) { attempt += 1 }
      } else if let cities {
        if cities.isEmpty {
          ContentUnavailableView(copy("plan.emptyTitle"), systemImage: "mappin",
            description: Text(copy("homePlaces.planNeedsPlaces")))
        } else {
          List(cities, id: \.city) { city in
            var url: URLComponents {
              var parts = URLComponents()
              parts.path = trip ? "/new-trip" : "/date-plan"
              parts.queryItems = [URLQueryItem(name: "city", value: city.city)]
              return parts
            }
            if let link = url.string.flatMap({ AppLink($0) }) {
              NavigationLink(city.city, value: link)
            }
          }
        }
      } else {
        ProgressView()
      }
    }
    .navigationTitle(copy(trip ? "homePlaces.planTrip" : "plan.goOut"))
    .task(id: attempt) {
      failed = false
      do {
        for try await listed in backend.query("items:listCities", as: [City].self) {
          cities = listed.filter { $0.placeCount != 0 }
        }
      } catch { if !Task.isCancelled { failed = true } }
    }
  }
}
