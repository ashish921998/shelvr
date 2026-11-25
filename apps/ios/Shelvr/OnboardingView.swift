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
  @Environment(\.colorScheme) private var scheme
  @Environment(\.dynamicTypeSize) private var type
  @AppStorage("swift.appearance") private var appearance = "system"
  private var palette: HomeChromePalette { HomeChromePalette(scheme, appearance: appearance) }
  @AppStorage private var complete: Bool
  @State private var busy = false
  @State private var errorKey: String?
  @State private var paywall = false
  @State private var purchased = false
  @State private var free = false
  @State private var entered = Date()
  @State private var unavailable = false
  @State private var cityQuery = ""
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
          VStack(alignment: .leading, spacing: 14) {
            content
            if let errorKey { Text(copy(errorKey)).foregroundStyle(.red) }
          }
          .frame(maxWidth: .infinity, alignment: .leading).padding(24)
        }
        .background(palette.background.ignoresSafeArea())
        .foregroundStyle(palette.foreground)
        .safeAreaInset(edge: .bottom) {
          Button {
            if progress.step == .ahaShare { practiceShare = true } else { proceed(skip: false) }
          } label: {
            Text(copy(progress.step == .ahaShare ? "common.share" : progress.step == .opener ? "opener.getStarted" :
              progress.step == .notifications ? "onboardingNotify.allow" : "common.continue"))
              .font(.custom("Satoshi-Bold", size: 17, relativeTo: .headline))
              .frame(maxWidth: .infinity, minHeight: 56).foregroundStyle(palette.background)
              .background(palette.foreground, in: Capsule())
          }
          .buttonStyle(FirstRunPillStyle())
          .disabled(busy || (progress.step == .goal && progress.goals.isEmpty) ||
            (progress.step == .savedCount && progress.savedCount == nil) || (progress.step == .been && progress.visitedCities.isEmpty) || (progress.step == .city && progress.city == nil))
          .padding(.horizontal, 24).padding(.vertical, 8).background(palette.background)
        }
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
          if progress.step != .opener {
            ToolbarItem(placement: .topBarLeading) {
              Button { progress.back(); persist() } label: { Label(copy("common.back"), systemImage: "chevron.left") }
            }
            ToolbarItem(placement: .principal) {
              let steps = OnboardingProgress.Step.allCases
              ProgressView(value: Double(steps.firstIndex(of: progress.step) ?? 0), total: Double(steps.count - 1))
                .tint(palette.primaryText).frame(width: 128)
            }
            ToolbarItem(placement: .topBarTrailing) {
              Button(copy("onboardingQ.skip")) { proceed(skip: true) }
            }
          }
        }
        .disabled(busy)
        .onChange(of: progress.step, initial: true) { _, step in
          cityQuery = ""
          entered = Date()
          if progress.viewed?.contains(step) != true {
            progress.viewed = (progress.viewed ?? []).union([step]); persist()
            Analytics.capture("onboarding_step_viewed", stepProperties(step))
          }
        }
        .task {
          if progress.step == .notifications,
            await UNUserNotificationCenter.current().notificationSettings().authorizationStatus != .notDetermined {
            progress.step = .carousel; carousel = 2; persist()
          }
        }
        .sheet(isPresented: $practiceShare) {
          PracticeShareGuide {
            practiceShare = false
            proceed(skip: false)
          }
        }
        .sheet(isPresented: $paywall, onDismiss: {
          if purchased || free || unavailable { finish() }
          else if progress.step == .notifications { progress.step = .carousel; carousel = 2; persist() }
        }) {
          BillingSheet(destination: .paywall, goalVariables: goalVariables,
            availabilityChanged: { available in
              unavailable = !available
              if !available { paywall = false }
            }, confirmed: { purchased = true })
        }
      }
    }
  }

  @ViewBuilder private var content: some View {
    switch progress.step {
    case .opener:
      OnboardingOpener(palette: palette)
    case .savedCount:
      title("onboardingQ.savedTitle")
      ForEach(["Few", "TenToFifty", "FiftyToTwoHundred", "Hundreds", "LostCount"], id: \.self) { count in
        choice(copy("onboardingQ.saved\(count)"), emoji: ["Few": "🌱", "TenToFifty": "📌", "FiftyToTwoHundred": "🗂️", "Hundreds": "🏔️", "LostCount": "🌀"][count], selected: progress.savedCount == count) {
          progress.savedCount = count; persist()
        }
      }
    case .goal:
      title("onboardingQ.goalTitle")
      ForEach(["date", "travel", "food"], id: \.self) { goal in
        choice(copy("onboardingQ.goal\(goal.capitalized)"), emoji: ["date": "🍷", "travel": "✈️", "food": "🍜"][goal], detail: copy("onboardingQ.goal\(goal.capitalized)Body"), selected: progress.goals.contains(goal)) {
          if !progress.goals.insert(goal).inserted { progress.goals.remove(goal) }; persist()
        }
      }
      let everyGoal: Set<String> = ["date", "travel", "food"]
      choice(copy("onboardingQ.goalEverything"), emoji: "✨", selected: progress.goals == everyGoal) {
        progress.goals = progress.goals == everyGoal ? [] : everyGoal
        persist()
      }
    case .been, .city:
      let been = progress.step == .been
      title(been ? "cityStamps.onboardingTitle" :
        progress.goals.contains("travel") && !progress.goals.contains("date") ? "onboardingQ.cityTitleTrip" : "onboardingQ.cityTitleOut")
      Text(copy(been ? "cityStamps.onboardingBody" : "onboardingQ.cityBody"))
      HStack {
          Image(systemName: "magnifyingglass").accessibilityHidden(true)
          TextField(copy("goal.citySearch"), text: $cityQuery).autocorrectionDisabled()
        }.padding(12).background(palette.surface, in: .rect(cornerRadius: 14))
      let cities = SampleReel.all.filter { cityQuery.isEmpty || copy($0.cityKey).localizedStandardContains(cityQuery) ||
        $0.id.replacingOccurrences(of: "-", with: " ").localizedStandardContains(cityQuery) }
      LazyVGrid(columns: Array(repeating: GridItem(.flexible()), count: type.isAccessibilitySize ? 1 : 2), spacing: 12) {
        ForEach(cities.sorted { copy($0.cityKey).localizedStandardCompare(copy($1.cityKey)) == .orderedAscending }) { city in
          let selected = been ? progress.visitedCities.contains(city.id) : progress.city == city.id
          cityChoice(city, selected: selected) {
            if been {
              if !progress.visitedCities.insert(city.id).inserted { progress.visitedCities.remove(city.id) }
            } else { progress.city = city.id; proceed(skip: false) }
            persist()
          }
        }
      }
      if been && cities.isEmpty { Text(copy("cityStamps.noMatch")).foregroundStyle(palette.muted) }
      if !been {
        Button(copy(progress.goals.contains("travel") && !progress.goals.contains("date") ? "interests.cityNotSure" : "goal.citySomewhere")) {
          progress.city = nil
          proceed(skip: false)
        }.buttonStyle(.bordered)
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
          ["city": copy(reel.cityKey)])).font(.custom("Satoshi-Bold", size: 39, relativeTo: .largeTitle))
          .frame(minHeight: 280).accessibilityAddTraits(.isHeader)
      }
    case .ahaShare:
      title("aha.shareTitle")
      if let reel {
        PracticeReel(url: reel.url.appending(path: "embed/")).frame(height: 280)
        Link(destination: reel.url) { Label(copy("aha.reelBy", ["handle": reel.creator]), systemImage: "play.rectangle") }
        Text(copy("aha.coachShare"))
      }
    case .firstSave:
      Text(copy("onboardingStatement.firstSave")).font(.custom("Satoshi-Bold", size: 39, relativeTo: .largeTitle))
        .multilineTextAlignment(.center).frame(maxWidth: .infinity, minHeight: 300).accessibilityAddTraits(.isHeader)
    case .ahaSpots:
      if let reel {
        Text(copy("aha.cityPlaces", ["city": copy(reel.cityKey)])).font(.largeTitle.bold())
        sampleMap(reel)
        ForEach(Array(reel.places.enumerated()), id: \.offset) { i, place in
          HStack { Text(String(i+1)).font(.caption.bold()).padding(7).background(palette.primary, in: Circle()).foregroundStyle(palette.onPrimary)
            Text(place.name).font(.custom("Satoshi-Bold", size: 16, relativeTo: .body))
          }
        }
        Text(copy("aha.fromReel", ["handle": reel.creator])).font(.footnote)
      }
    case .carousel:
      TabView(selection: $carousel) {
        ForEach(Array(["together", "eat", "map"].enumerated()), id: \.offset) { index, key in
          ScrollView {
            VStack(alignment: .leading, spacing: 18) {
              title("onboardingCarousel." + key)
              if let reel { featurePreview(key, reel: reel) }
            }.frame(maxWidth: .infinity, alignment: .leading).padding(8)
          }.tag(index)
        }
      }.tabViewStyle(.page).frame(height: type.isAccessibilitySize ? 550 : 410)
    case .notifications:
      title("onboardingNotify.title")
      Text(copy("onboardingNotify.sub")).foregroundStyle(palette.muted)
      if let reel {
        notificationPreview(copy("reminder.tripEveTitle", ["city": copy(reel.cityKey)]),
          message: copy("reminder.tripEveBody", count: reel.places.count))
        if let first = reel.places.first {
          notificationPreview(copy("reminder.visitTitle"), message: copy("reminder.visitBody", ["title": first.name]))
        }
      }
    }
  }

  @ViewBuilder private func featurePreview(_ kind: String, reel: SampleReel) -> some View {
    let trip = progress.goals.contains("travel") && !progress.goals.contains("date")
    if kind == "map" {
      Label(copy("map.searchPlaceholder"), systemImage: "magnifyingglass").foregroundStyle(palette.muted)
      sampleMap(reel)
    } else {
      VStack(alignment: .leading, spacing: 14) {
        Text(copy(kind == "together" ? reel.cityKey : trip ? "homePlaces.planTrip" : "homePlaces.planDate"))
          .font(.custom("Satoshi-Bold", size: 21, relativeTo: .title2))
        if kind == "together" { Label(copy("sharedLists.invite"), systemImage: "person.2") }
        ForEach(Array(reel.places.prefix(kind == "eat" ? 2 : reel.places.count).enumerated()), id: \.offset) { _, place in
          Label(place.name, systemImage: "mappin.circle.fill").font(.subheadline)
        }
        if kind == "eat" { Label(copy(progress.goals.contains("date") ? "datePlan.send" : "common.share"), systemImage: "square.and.arrow.up") }
      }.frame(maxWidth: .infinity, alignment: .leading).padding(18)
        .background(palette.surface, in: .rect(cornerRadius: 20))
        .overlay { RoundedRectangle(cornerRadius: 20).strokeBorder(palette.border) }
    }
  }

  private func notificationPreview(_ title: String, message: String) -> some View {
    HStack(alignment: .top, spacing: 12) {
      FirstRunPicture(name: "first-run-icon", ext: "png").frame(width: 38, height: 38).clipShape(.rect(cornerRadius: 9))
      VStack(alignment: .leading, spacing: 4) {
        Text(title).font(.custom("Satoshi-Bold", size: 16, relativeTo: .headline))
        Text(message).font(.subheadline)
      }
    }.padding(16).frame(maxWidth: .infinity, alignment: .leading)
      .background(palette.surface, in: .rect(cornerRadius: 20))
      .overlay { RoundedRectangle(cornerRadius: 20).strokeBorder(palette.border) }
  }

  private func sampleMap(_ reel: SampleReel) -> some View {
    Map(interactionModes: []) {
      ForEach(reel.places, id: \.name) { place in
        Marker(place.name, coordinate: CLLocationCoordinate2D(latitude: place.lat, longitude: place.lng))
      }
    }.frame(height: 240).clipShape(.rect(cornerRadius: 16))
  }

  private func title(_ key: String) -> some View {
    Text(copy(key)).font(.custom("Satoshi-Bold", size: 30, relativeTo: .largeTitle))
      .tracking(-0.6).accessibilityAddTraits(.isHeader)
  }

  private func cityChoice(_ city: SampleReel, selected: Bool, action: @escaping () -> Void) -> some View {
    Button(action: action) {
      Text(copy(city.cityKey)).font(.custom("Satoshi-Bold", size: 17, relativeTo: .headline))
        .foregroundStyle(.white).shadow(radius: 2).padding(12)
        .frame(maxWidth: .infinity, minHeight: type.isAccessibilitySize ? 116 : 100, alignment: .bottomLeading)
        .background {
          GeometryReader { geometry in
            FirstRunPicture(name: "library-city-" + city.id, ext: "jpg").scaledToFill()
              .frame(width: geometry.size.width, height: geometry.size.height).clipped().accessibilityHidden(true)
          }.overlay { LinearGradient(colors: [.clear, .black.opacity(0.68)], startPoint: .center, endPoint: .bottom) }
        }
        .background(palette.muted)
        .overlay(alignment: .topTrailing) {
          if selected { Image(systemName: "checkmark.circle.fill").symbolRenderingMode(.palette)
            .foregroundStyle(palette.onPrimary, palette.primary).padding(8).accessibilityHidden(true) }
        }.clipShape(.rect(cornerRadius: 14))
        .overlay { RoundedRectangle(cornerRadius: 14).strokeBorder(selected ? palette.primary : palette.border, lineWidth: selected ? 3 : 1) }
        .contentShape(Rectangle())
    }.buttonStyle(.plain).accessibilityAddTraits(selected ? .isSelected : [])
  }

  private func choice(_ text: String, emoji: String? = nil, detail: String? = nil, selected: Bool, action: @escaping () -> Void) -> some View {
    Button(action: action) {
      HStack(spacing: 12) {
        if let emoji { Text(emoji).font(.title2).accessibilityHidden(true) }
        VStack(alignment: .leading, spacing: 3) {
          Text(text).font(.custom("Satoshi-Bold", size: 17, relativeTo: .headline))
          if let detail { Text(detail).font(.subheadline).foregroundStyle(palette.muted) }
        }
        Spacer()
        Image(systemName: selected ? "checkmark.circle.fill" : "circle").foregroundStyle(selected ? palette.primaryText : palette.muted)
      }.padding(13).frame(minHeight: 54).background(selected ? palette.primary.opacity(0.13) : palette.surface, in: .rect(cornerRadius: 16))
        .overlay { RoundedRectangle(cornerRadius: 16).strokeBorder(selected ? palette.primaryText : palette.border, lineWidth: 1.5) }
    }.buttonStyle(.plain).accessibilityAddTraits(selected ? .isSelected : [])
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

  private func recordCompletion(skipped skip: Bool) {
    if progress.completed?.contains(progress.step) != true {
      progress.completed = (progress.completed ?? []).union([progress.step]); persist()
      var properties = stepProperties(progress.step)
      properties["skipped"] = skip
      properties["duration_ms"] = max(0, Int(Date().timeIntervalSince(entered) * 1000))
      Analytics.capture("onboarding_step_completed", properties)
    }
  }

  private func proceed(skip: Bool) {
    guard !busy else { return }
    errorKey = nil
    if progress.step == .carousel, !skip, carousel < 2 { carousel += 1; return }
    if progress.step == .notifications {
      busy = true
      Task {
        if !skip, (try? await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge])) == true {
          UIApplication.shared.registerForRemoteNotifications()
        }
        await checkAccess(skipped: skip)
      }
    } else if progress.step == .carousel {
      busy = true
      Task {
        let settings = await UNUserNotificationCenter.current().notificationSettings()
        if settings.authorizationStatus == .notDetermined {
          recordCompletion(skipped: skip); progress.advance(); persist(); busy = false
        } else { await checkAccess(skipped: skip) }
      }
    } else { recordCompletion(skipped: skip); progress.advance(skipping: skip); persist() }
  }

  private func checkAccess(skipped: Bool) async {
    defer { busy = false }
    do {
      for try await plan in backend.query("subscriptions:getEntitlement", as: ServerPlan.self) {
        if plan.entitled { recordCompletion(skipped: skipped); purchased = true; finish(); return }
        break
      }
      for try await open in backend.query("freeSaves:freePlanOpen", as: Bool.self) {
        recordCompletion(skipped: skipped); free = open; purchased = false; unavailable = false; paywall = true; return
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
    let entry = OnboardingHandoff(cities: progress.visitedCities.sorted(), url: progress.skippedShare ? nil : reel?.url,
      operation: progress.demoOperationID, space: nil)
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
