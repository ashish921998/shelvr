import ConvexMobile
import Charts
import MapKit
import WebKit
import ShelvrKit
import SwiftUI
import UserNotifications

struct OnboardingGate: View {
  @Binding var pendingLink: AppLink?
  @Environment(Backend.self) private var backend
  @Environment(\.copy) private var copy
  @State private var account: String?
  @State private var failed = false
  @State private var attempt = 0

  var body: some View {
    Group {
      if let account {
        OnboardingAccount(account: account, pendingLink: $pendingLink).id(account)
      } else if failed {
        Button(copy("common.retry")) { attempt += 1 }
      } else { ProgressView() }
    }
    .task(id: attempt) {
      failed = false
      do {
        for try await user in backend.query("users:getCurrentUser", as: AccountView.CurrentUser?.self) {
          try Task.checkCancellation()
          account = user?._id
          failed = account == nil
        }
      } catch { if !Task.isCancelled { failed = true } }
    }
  }
}

private struct SampleReel: Decodable, Identifiable {
  struct Spot: Decodable { let name: String; let lat, lng: Double }
  let id, creator: String
  let url: URL
  let places: [Spot]

  var cityKey: String { "tripTeaser.city" + id.split(separator: "-").map { $0.capitalized }.joined() }

  static let all: [Self] = {
    guard let file = Bundle.main.url(forResource: "OnboardingReels", withExtension: "json"),
      let data = try? Data(contentsOf: file), let reels = try? JSONDecoder().decode([Self].self, from: data)
    else { return [] }
    return reels
  }()
}

private struct OnboardingAccount: View {
  let account: String
  @Binding var pendingLink: AppLink?
  @Environment(Backend.self) private var backend
  @Environment(\.copy) private var copy
  @State private var progress: OnboardingProgress
  @AppStorage private var complete: Bool
  @State private var busy = false
  @State private var errorKey: String?
  @State private var paywall = false
  @State private var purchased = false
  @State private var free = false
  @State private var entered = Date()
  @State private var unavailable = false
  @State private var practiceShare = false
  @State private var carousel = 0

  init(account: String, pendingLink: Binding<AppLink?>) {
    self.account = account
    _pendingLink = pendingLink
    _complete = AppStorage(wrappedValue: false, "swift.onboarded." + account)
    let data = UserDefaults.standard.data(forKey: "swift.onboarding." + account)
    _progress = State(initialValue: data.flatMap { try? JSONDecoder().decode(OnboardingProgress.self, from: $0) }
      ?? OnboardingProgress())
  }

  private var reel: SampleReel? {
    SampleReel.all.first { $0.id == (progress.city ?? "austin") }
  }

  var body: some View {
    if complete {
      SignedInView(pendingLink: $pendingLink).modifier(OnboardingReplay(account: account))
    } else {
      NavigationStack {
        ScrollView {
          VStack(alignment: .leading, spacing: 20) {
            content
            if let errorKey { Text(copy(errorKey)).foregroundStyle(.red) }
          }
          .frame(maxWidth: .infinity, alignment: .leading).padding(24)
        }
        .safeAreaInset(edge: .bottom) {
          Button(copy(progress.step == .ahaShare ? "common.share" : progress.step == .opener ? "opener.getStarted" :
            progress.step == .notifications ? "onboardingNotify.allow" : "common.continue")) {
            if progress.step == .ahaShare { practiceShare = true } else { proceed(skip: false) }
          }
          .buttonStyle(.borderedProminent).controlSize(.large)
          .disabled(busy || (progress.step == .goal && progress.goals.isEmpty) ||
            (progress.step == .savedCount && progress.savedCount == nil) || (progress.step == .been && progress.visitedCities.isEmpty) || (progress.step == .city && progress.city == nil))
          .padding()
        }
        .toolbar {
          if progress.step != .opener {
            ToolbarItem(placement: .topBarLeading) {
              Button(copy("common.back")) { progress.back(); persist() }
            }
            ToolbarItem(placement: .topBarTrailing) {
              Button(copy("onboardingQ.skip")) { proceed(skip: true) }
            }
          }
        }
        .disabled(busy)
        .onChange(of: progress.step, initial: true) { _, step in
          entered = Date()
          if progress.viewed?.contains(step) != true {
            progress.viewed = (progress.viewed ?? []).union([step]); persist()
            Analytics.capture("onboarding_step_viewed", stepProperties(step))
          }
        }
        .sheet(isPresented: $practiceShare) {
          VStack(alignment: .leading, spacing: 20) {
            Text(copy("aha.coachShelvr")).font(.title.bold())
            Button {
              practiceShare = false
              proceed(skip: false)
            } label: {
              Label("Shelvr", systemImage: "bookmark.fill").frame(maxWidth: .infinity)
            }.buttonStyle(.borderedProminent)
          }.padding(24).presentationDetents([.height(180)])
        }
        .sheet(isPresented: $paywall, onDismiss: {
          if purchased || free || unavailable { finish() }
        }) {
          BillingSheet(destination: .paywall, goalVariables: goalVariables,
            unavailable: { unavailable = true }, confirmed: { purchased = true })
        }
      }
    }
  }

  @ViewBuilder private var content: some View {
    switch progress.step {
    case .opener:
      title("onboarding.openerSaveTitle"); title("onboarding.openerSaveAccent")
      Text(copy("opener.tagline"))
    case .savedCount:
      title("onboardingQ.savedTitle")
      ForEach(["Few", "TenToFifty", "FiftyToTwoHundred", "Hundreds", "LostCount"], id: \.self) { count in
        choice(copy("onboardingQ.saved\(count)"), selected: progress.savedCount == count) {
          progress.savedCount = count; persist()
        }
      }
    case .goal:
      title("onboardingQ.goalTitle")
      ForEach(["date", "travel", "food"], id: \.self) { goal in
        choice(copy("onboardingQ.goal\(goal.capitalized)"), selected: progress.goals.contains(goal)) {
          if !progress.goals.insert(goal).inserted { progress.goals.remove(goal) }; persist()
        }
      }
    case .been, .city:
      let been = progress.step == .been
      title(been ? "cityStamps.onboardingTitle" :
        progress.goals.contains("travel") && !progress.goals.contains("date") ? "onboardingQ.cityTitleTrip" : "onboardingQ.cityTitleOut")
      Text(copy(been ? "cityStamps.onboardingBody" : "onboardingQ.cityBody"))
      ForEach(SampleReel.all) { city in
        choice(copy(city.cityKey), selected: been ? progress.visitedCities.contains(city.id) : progress.city == city.id) {
          if been {
            if !progress.visitedCities.insert(city.id).inserted { progress.visitedCities.remove(city.id) }
          } else { progress.city = city.id; proceed(skip: false) }
          persist()
        }
      }
    case .chart:
      title("onboardingChart.title")
      Chart {
        ForEach(Array([0, 2, 3, 5, 9, 15, 22].enumerated()), id: \.offset) { day, value in
          AreaMark(x: .value("Day", day), y: .value("Places", value)).interpolationMethod(.monotone)
            .foregroundStyle(.linearGradient(colors: [.accentColor, .clear], startPoint: .top, endPoint: .bottom))
        }
      }.chartXAxis(.hidden).chartYAxis(.hidden).frame(height: 180).accessibilityHidden(true)
      Label(copy("onboardingChart.lost"), systemImage: "bookmark")
      Label(copy(progress.goals.contains("date") ? "onboardingChart.goalDate" :
        progress.goals.contains("travel") ? "onboardingChart.goalTrip" : "onboardingChart.goalWeekend"), systemImage: "calendar")
    case .cityEcho:
      if let reel {
        Text(copy(progress.city == nil ? "onboardingStatement.cityStart" : "onboardingStatement.cityPicked",
          ["city": copy(reel.cityKey)])).font(.largeTitle.bold())
      }
    case .ahaShare:
      title("aha.shareTitle")
      if let reel {
        PracticeReel(url: reel.url.appending(path: "embed/")).frame(height: 280)
        Link(destination: reel.url) { Label(copy("aha.reelBy", ["handle": reel.creator]), systemImage: "play.rectangle") }
        Text(copy("aha.coachShare"))
      }
    case .firstSave: title("onboardingStatement.firstSave")
    case .ahaSpots:
      if let reel {
        Text(copy("aha.cityPlaces", ["city": copy(reel.cityKey)])).font(.largeTitle.bold())
        sampleMap(reel)
        ForEach(reel.places, id: \.name) { Text($0.name) }
        Text(copy("aha.fromReel", ["handle": reel.creator])).font(.footnote)
      }
    case .carousel:
      TabView(selection: $carousel) {
        ForEach(Array(["together", "eat", "map"].enumerated()), id: \.offset) { index, key in
          VStack {
            title("onboardingCarousel." + key)
            if let reel { sampleMap(reel) }
          }.padding().tag(index)
        }
      }.tabViewStyle(.page).frame(height: 380)
    case .notifications:
      title("onboardingNotify.title"); Text(copy("onboardingNotify.sub"))
    }
  }

  private func sampleMap(_ reel: SampleReel) -> some View {
    Map(interactionModes: []) {
      ForEach(reel.places, id: \.name) { place in
        Marker(place.name, coordinate: CLLocationCoordinate2D(latitude: place.lat, longitude: place.lng))
      }
    }.frame(height: 240).clipShape(.rect(cornerRadius: 16))
  }

  private func title(_ key: String) -> some View { Text(copy(key)).font(.largeTitle.bold()) }

  private func choice(_ text: String, selected: Bool, action: @escaping () -> Void) -> some View {
    Button(action: action) {
      HStack { Text(text); Spacer(); Image(systemName: selected ? "checkmark.circle.fill" : "circle") }
        .padding().background(.thinMaterial, in: .rect(cornerRadius: 12))
    }.accessibilityAddTraits(selected ? .isSelected : [])
  }

  private func persist() {
    if let data = try? JSONEncoder().encode(progress) {
      UserDefaults.standard.set(data, forKey: "swift.onboarding." + account)
    }
  }

  private func stepProperties(_ step: OnboardingProgress.Step) -> [String: Any] {
    let ids: [OnboardingProgress.Step: String] = [.savedCount: "saved_count", .been: "been_cities",
      .chart: "progress_chart", .cityEcho: "city_echo", .ahaShare: "aha_share", .firstSave: "first_save",
      .ahaSpots: "aha_spots", .notifications: "notification_ask"]
    return ["step_id": ids[step] ?? step.rawValue, "step_index": OnboardingProgress.Step.allCases.firstIndex(of: step) ?? 0,
      "flow_version": 27]
  }

  private func proceed(skip: Bool) {
    guard !busy else { return }
    errorKey = nil
    if progress.step == .carousel, !skip, carousel < 2 { carousel += 1; return }
    if progress.completed?.contains(progress.step) != true {
      progress.completed = (progress.completed ?? []).union([progress.step]); persist()
      var properties = stepProperties(progress.step)
      properties["skipped"] = skip
      properties["duration_ms"] = max(0, Int(Date().timeIntervalSince(entered) * 1000))
      Analytics.capture("onboarding_step_completed", properties)
    }
    if progress.step == .notifications {
      busy = true
      Task {
        if !skip, (try? await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge])) == true {
          UIApplication.shared.registerForRemoteNotifications()
        }
        await checkAccess()
      }
    } else if progress.step == .carousel {
      busy = true
      Task {
        let settings = await UNUserNotificationCenter.current().notificationSettings()
        if settings.authorizationStatus == .notDetermined {
          progress.advance(); persist(); busy = false
        } else { await checkAccess() }
      }
    } else { progress.advance(skipping: skip); persist() }
  }

  private func checkAccess() async {
    defer { busy = false }
    do {
      for try await plan in backend.query("subscriptions:getEntitlement", as: ServerPlan.self) {
        if plan.entitled { purchased = true; finish(); return }
        break
      }
      for try await open in backend.query("freeSaves:freePlanOpen", as: Bool.self) {
        free = open; purchased = false; unavailable = false; paywall = true; return
      }
    } catch { errorKey = "errors.tryAgain" }
  }

  private var goalVariables: [String: String] {
    guard let goal = ["date", "travel", "food"].first(where: progress.goals.contains) else { return [:] }
    let cityName = progress.city.flatMap { id in SampleReel.all.first { $0.id == id } }.map { copy($0.cityKey) }
    var values = ["goal": goal, "goal_city": progress.city ?? ""]
    for (key, suffix) in [
      ("goal_headline", "Headline"), ("goal_subline", "Subline"), ("goal_photo_tag", "PhotoTag"),
      ("goal_answer_1", "AnswerOne"), ("goal_answer_2", "AnswerTwo"), ("goal_today", "Today"),
      ("goal_plan_title", "PlanTitle"), ("goal_benefit_title", "BenefitTitle"), ("goal_benefit_body", "BenefitBody")
    ] {
      let noCity = cityName == nil && ((goal == "travel" && ["Headline", "Today", "PlanTitle"].contains(suffix))
        || (goal == "food" && suffix == "Today"))
      let label = "paywallGoal." + goal + suffix + (noCity ? "NoCity" : "")
      values[key] = cityName == nil && suffix == "AnswerTwo" ? "" : copy(label, ["city": cityName ?? ""])
    }
    if !progress.visitedCities.isEmpty {
      values["goal_headline"] = copy("passport.paywallHeadline", count: progress.visitedCities.count)
    }
    return values
  }

  private func finish() {
    let spaces = ["date": "interests.vibeDateNights", "travel": "presets.travel", "food": "presets.restaurants"]
    let goal = ["date", "travel", "food"].first(where: progress.goals.contains)
    let entry = PendingOnboarding(cities: progress.visitedCities.sorted(), url: progress.skippedShare ? nil : reel?.url,
      operation: progress.demoOperationID, space: goal.flatMap { spaces[$0] }.map { copy($0) })
    do {
      try entry.save(account)
      complete = true
      UserDefaults.standard.removeObject(forKey: "swift.onboarding." + account)
    } catch { errorKey = "errors.tryAgain" }
  }
}

private struct PracticeReel: UIViewRepresentable {
  let url: URL
  func makeUIView(context: Context) -> WKWebView {
    let config = WKWebViewConfiguration()
    config.allowsInlineMediaPlayback = true
    config.websiteDataStore = .nonPersistent()
    let web = WKWebView(frame: .zero, configuration: config)
    web.load(URLRequest(url: url))
    return web
  }
  func updateUIView(_ view: WKWebView, context: Context) {}
}
