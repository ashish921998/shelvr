import MapKit
import ShelvrKit
import SwiftUI

struct SignedInView: View {
  @Environment(Backend.self) private var backend
  @State private var access = PlanAccess()
  @Binding var pendingLink: AppLink?
  @Environment(InviteEntry.self) private var invites
  @Environment(\.copy) private var copy
  @State private var library = false
  @State private var librarySearchFocused = false
  @State private var billing: BillingDestination?
  @State private var path: [AppLink] = []
  @State private var stampMessage: String?

  private var showsMap: Bool { !access.loading && !access.locked && !library }
  private var tabBar: HomeTabBar {
    HomeTabBar(library: library, switchTab: { library.toggle() },
      add: { open("/add-spots") }, plan: { open("/go-out") })
  }

  var body: some View {
    NavigationStack(path: $path) {
      Group {
        if access.loading { loadingPlan } else if access.locked { PlanGateView() } else if library {
          LibraryView(screen: .home, searchFocusChanged: { librarySearchFocused = $0 })
        } else {
          SavedPlacesMap(open: open, tabBar: tabBar)
        }
      }
      .navigationTitle(copy(library ? "navigation.library" : "navigation.map"))
      .toolbar(showsMap ? .hidden : .visible, for: .navigationBar)
      .toolbar {
        ToolbarItem(placement: .topBarTrailing) {
          Button { open("/profile") } label: {
            Label(copy("navigation.profile"), systemImage: "person.crop.circle")
          }
        }
      }
      .safeAreaInset(edge: .bottom) {
        if library && !librarySearchFocused && !access.loading && !access.locked {
          tabBar
        }
      }
      .navigationDestination(for: AppLink.self) { link in
        if access.loading && PlanRoutes.needsLoadedPlan(link) { loadingPlan }
        else if access.locked && !PlanRoutes.allowedWithoutPersonalAccess(link) { PlanGateView() }
        else { switch link.path.first {
        case "settings": AccountSettingsView()
        case "profile": AccountView().navigationTitle(copy("navigation.profile"))
        case "add-spots":
          List {
            entry("/add", "addSheet.pasteLink", "link")
            entry("/add", "addSheet.googleMapsList", "map")
            entry("/new-shared-list", "sharedLists.newTitle", "person.2")
            entry("/new-trip", "homePlaces.planTrip", "suitcase")
            entry("/photo", "item.photo", "photo")
            entry("/how-to-share", "addSheet.howToShare", "square.and.arrow.up")
            if Locale.preferredLanguages.first?.hasPrefix("en") == true {
              entry("/save-with-siri", "addSheet.saveWithSiri", "mic")
            }
          }
          .navigationTitle(copy("addSheet.title"))
        case "passport-story": PassportStoryView()
        case "trips": TripsTabView()
        case "shared-trip-links": ActiveTripLinksView()
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
        case "passport-invite" where link.path.count == 2: FriendPassportView(token: link.path[1], compareInitially: link.query.contains { $0.name == "compare" && $0.value == "1" }).id(link)
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
          if let id = PlanRoutes.listID(link) {
            SocialQuery(query: "sharedLists:getSharedList", arguments: ["listId": id], type: SharedListDetail?.self) { list in
              if let list { AddListPlaceView(detail: list, initialCity: link.query.first { $0.name == "city" }?.value) }
              else { ContentUnavailableView(copy("sharedLists.goneTitle"), systemImage: "person.2") }
            }.id(link)
          } else { SharedListsView() }
        case "passport": PassportView(open: open)
        case "passport-card": PassportView(cardCity: link.query.first { $0.name == "city" }?.value)
        case "add": PasteLinkView()
        case "saves": LibraryView(screen: .saves)
        case "review-saves": LibraryView(screen: .review)
        case "spots" where link.path.count == 2:
          SaveSpotRevealView(id: link.path[1]) { city in
            guard path.last == link else { return }
            library = false
            if let city, let encoded = city.addingPercentEncoding(withAllowedCharacters: .alphanumerics),
              let destination = AppLink("/city/" + encoded) { path = [destination] }
            else { path = [] }
          }.id(link)
        case "city" where link.path.count == 2: CityPlacesView(city: link.path[1]).id(link.path[1])
        case "cities": LibraryCitiesView()
        case "item" where link.path.count == 2: LibraryItemView(id: link.path[1])
        case "edit-save-places":
          if let id = link.query.first(where: { $0.name == "itemId" })?.value {
            LibraryPlaceEditor(id: id).id(id)
          } else { ShellDestination(link: link) }
        case "date-plan", "go-out", "new-trip":
          if link.path == ["new-trip"], !link.query.contains(where: { $0.name == "listId" || ($0.name == "mode" && $0.value == "generate") }) {
            let city = link.query.first(where: { $0.name == "city" })?.value ?? ""
            BlankTripView(city: city) { selectedCity in
              if let next = BlankTrip.generationLink(city: selectedCity) { path.append(next) }
            } created: { result in
              if path.last == link { path[path.count - 1] = result }
            }
          } else if let city = link.query.first(where: { $0.name == "city" })?.value, !city.isEmpty {
            let listID = PlanRoutes.listID(link)
            if link.path.first == "new-trip" {
              NewCityTripView(city: city, listID: listID) { created in
                guard path.last == link else { return }
                path[path.count - 1] = created
              }.id(link)
            } else if link.path == ["go-out"] {
              GoOutView(city: city, listID: listID) { destination in
                var parts = URLComponents()
                parts.path = destination
                parts.queryItems = link.query
                if path.last == link, let next = parts.string.flatMap({ AppLink($0) }) { path[path.count - 1] = next }
              }.id(link)
            } else { CityDateView(city: city, listID: listID).id(link) }
          } else if let listID = PlanRoutes.listID(link) {
            SocialQuery(query: "sharedLists:getSharedList", arguments: ["listId": listID], type: SharedListDetail?.self) { list in
              List(list?.cities ?? [], id: \.self) { city in
                var route: URLComponents {
                  var parts = URLComponents()
                  parts.path = link.path.first == "new-trip" ? "/new-trip" : "/date-plan"
                  parts.queryItems = [URLQueryItem(name: "city", value: city), URLQueryItem(name: "listId", value: listID)]
                  return parts
                }
                if let target = route.string.flatMap({ AppLink($0) }) { NavigationLink(city, value: target) }
              }
            }
          } else { PlanCityView(trip: link.path.first == "new-trip") }
        case "trip-plan" where link.path.count == 2: CityTripView(id: link.path[1], sharedOnly: access.restrictsPersonalAccess).id(link.path[1])
        case "add-trip-stop":
          if let id = link.query.first(where: { $0.name == "tripId" })?.value {
            let day = link.query.first(where: { $0.name == "day" })?.value.flatMap(Int.init) ?? 1
            if access.restrictsPersonalAccess {
              SocialQuery(query: "tripPlannerData:getSharedTripPlan", arguments: ["tripId": id], type: CityTrip?.self) { trip in
                if let trip, trip.listId != nil { AddTripStopView(id: id, initialDay: day, sharedTrip: trip).id(link) }
                else if access.loading { loadingPlan }
                else { PlanGateView() }
              }
            } else { AddTripStopView(id: id, initialDay: day).id(link) }
          } else { ShellDestination(link: link) }
        case "photo": PhotoSaveView()
        case "how-to-share": SaveInstructions(siri: false)
        case "save-with-siri": SaveInstructions(siri: true)
        case "plan-gate", "paywall": PlanGateView()
        default: ShellDestination(link: link)
        } }
      }
    }
    .modifier(CancelSurveyCard(home: library && path.isEmpty))
    .modifier(TrialReminderObserver(home: library && path.isEmpty))
    .modifier(SiriFolderRefresh(entitled: access.pro))
    .environment(access)
    .sheet(item: $billing) { BillingSheet(destination: $0, confirmed: { access.retry += 1 }) }
    .task(id: access.retry) { await access.readPlan(backend) }
    .task(id: "\(access.retry):\(access.plan == nil):\(access.pro)") { await access.readAllowance(backend) }
    .task(id: access.plan?.expiresAt) {
      if let expiration = access.plan?.expiresAt, access.pro { await access.expire(at: expiration) }
    }
    .alert(copy("passport.stampedTitle"), isPresented: Binding(get: { stampMessage != nil }, set: { if !$0 { stampMessage = nil } })) {
      Button(copy("common.close")) {}
    } message: { Text(stampMessage ?? "") }
    .onChange(of: pendingLink, initial: true) { _, link in
      guard let link else { return }
      pendingLink = nil
      navigate(to: link)
    }
    .onChange(of: invites.destination(account: backend.userID, session: backend.sessionGeneration), initial: true) { _, link in
      let account = backend.userID
      let session = backend.sessionGeneration
      guard let link, invites.destination(account: account, session: session) == link else { return }
      navigate(to: link)
      if let queued = invites.didNavigate(to: link, account: account, session: session), !invites.route(queued) {
        pendingLink = queued
      }
    }
  }

  private func navigate(to link: AppLink) {
    switch link.path {
    case ["map"], ["share"], ["plan-gate"]: library = false; path = []
    case ["home"]: library = true; path = []
    case ["paywall"]: billing = .paywall
    case ["sign-in"]: break
    default: path = [link]
    }
  }

  @ViewBuilder private var loadingPlan: some View {
    VStack(spacing: 16) {
      if access.failed { Button(copy("common.retry")) { access.retry += 1 } }
      else { ProgressView(copy("pro.checking")) }
      entry("/shared-lists", "sharedLists.title", "person.2")
      entry("/shared-trip-links", "tripShare.manage", "link")
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
              parts.path = trip ? "/new-trip" : "/go-out"
              parts.queryItems = [URLQueryItem(name: "city", value: city.city)]
              if trip { parts.queryItems?.append(URLQueryItem(name: "mode", value: "generate")) }
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
