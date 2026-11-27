import ShelvrKit
import SwiftUI

struct PassportView: View {
  var cardCity: String?
  var open: ((String) -> Void)?
  @Environment(Backend.self) private var backend
  @Environment(\.copy) private var copy
  @State private var stamps: [PassportStamp]?
  @State private var cities: [PassportCityStamp]?
  @State private var completion: [PassportCompletion] = []
  @State private var selected: PassportStamp?
  @State private var showBooklet = false
  @State private var afterStamp: String?
  @State private var errors = Set<String>()
  @State private var retry = 0
  @Environment(\.colorScheme) private var scheme
  @AppStorage("swift.appearance") private var appearance = "system"
  @Environment(\.dynamicTypeSize) private var dynamicType

  private static let tilts = [-6.0, 4, -3, 7]

  var body: some View {
    let pages = PassportPages(stamps: stamps ?? [], completion: completion, cities: cities ?? [])
    let sections = pages.sections
    Group {
      if let stamps {
        if let cardCity {
          if let section = sections.first(where: { $0.id == PassportSection.cityKey(cardCity) }), !section.places.isEmpty {
            PassportCard(section: section)
          } else { Text(copy("passport.nextEmpty", ["city": cardCity])) }
        } else {
          let palette = HomeChromePalette(scheme, appearance: appearance)
          ScrollView {
            LazyVStack(alignment: .leading, spacing: 18) {
              cover(places: stamps.count, StampCity.counts(places: stamps, stamps: cities ?? []), palette: palette)
              let stamped = PassportBooklet.pages(cities: cities ?? []).compactMap { page -> StampCity? in
                if case .city(let city, _) = page { return city }
                return nil
              }
              if !stamped.isEmpty { stampsCard(stamped, palette: palette) }
              if let cities, !errors.contains("placeVisits:cityCompletion") {
                PassportBadgeView(cities: cities, completion: completion).paperCard(palette)
              }
              if let already = AppLink("/already-been") {
                NavigationLink(value: already) {
                  Label(copy("passport.beenSomewhere"), systemImage: "checkmark.seal")
                    .font(.custom("Satoshi-Bold", size: 16, relativeTo: .headline))
                    .paperCard(palette)
                }
              }
              ForEach(sections) { cityCard($0, palette: palette) }
              if sections.isEmpty, cities?.isEmpty == true {
                ContentUnavailableView(copy("passport.beenSomewhere"), systemImage: "book.closed",
                  description: Text(copy("passport.beenBody")))
              }
            }
            .padding(.horizontal, 20).padding(.vertical, 12)
          }
          .foregroundStyle(palette.foreground)
          .background(palette.background.ignoresSafeArea())
          .buttonStyle(HomeChromePressStyle())
        }
      } else if errors.isEmpty { ProgressView() }
    }
    .safeAreaInset(edge: .bottom) {
      if !errors.isEmpty { Button(copy("common.retry")) { retry += 1 } }
    }
    .fullScreenCover(isPresented: $showBooklet) {
      PassportBookletView(cities: cities ?? [], counts: StampCity.counts(places: stamps ?? [], stamps: cities ?? []))
    }
    .sheet(item: $selected, onDismiss: {
      if let afterStamp { self.afterStamp = nil; open?(afterStamp) }
    }) { stamp in
      StampDetail(stamp: stamp) { route in
        guard selected?.id == stamp.id else { return }
        afterStamp = route
        selected = nil
      }
    }
    .navigationTitle(cardCity ?? copy("passport.title"))
    .toolbar {
      if cardCity == nil {
        ToolbarItem(placement: .topBarTrailing) {
          PassportActions(cities: errors.contains("cityStamps:listCityStamps") ? nil : cities, hasPlaces: stamps?.isEmpty == false) { retry += 1 }
        }
      }
    }
    .task(id: retry) {
      await watch("placeVisits:listPassportStamps", [PassportStamp].self) { stamps = $0 }
    }
    .task(id: retry) {
      cities = nil
      await watch("cityStamps:listCityStamps", [PassportCityStamp].self) { cities = $0 }
    }
    .task(id: retry) {
      await watch("placeVisits:cityCompletion", [PassportCompletion].self) { completion = $0 }
    }
  }

  private func watch<Row: Decodable>(_ name: String, _ type: Row.Type, set: (Row) -> Void) async {
    errors.remove(name)
    do {
      for try await row in backend.query(name, as: type) {
        try Task.checkCancellation()
        set(row)
      }
    } catch { if !Task.isCancelled { errors.insert(name) } }
  }

  private func cover(places: Int, _ counts: (cities: Int, countries: Int), palette: HomeChromePalette) -> some View {
    HStack(alignment: .top, spacing: 0) {
      count(places, "passport.places", palette)
      count(counts.cities, "passport.cities", palette)
      if counts.countries > 0 { count(counts.countries, "passport.countries", palette) }
    }
    .padding(.vertical, 22).padding(.horizontal, 12)
    .background { ZStack { palette.surface; ContourPaper(seed: 3, palette: palette) } }
    .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
    .overlay { RoundedRectangle(cornerRadius: 20, style: .continuous).strokeBorder(palette.border, lineWidth: 0.5) }
    .accessibilityElement(children: .combine)
  }

  private func count(_ number: Int, _ key: String, _ palette: HomeChromePalette) -> some View {
    VStack(spacing: 2) {
      Text(number, format: .number)
        .font(.custom("Satoshi-Bold", size: 34, relativeTo: .largeTitle)).foregroundStyle(palette.primaryText)
      Text(copy(key).uppercased())
        .font(.custom("Satoshi-Bold", size: 11, relativeTo: .caption2)).tracking(1.5).foregroundStyle(palette.muted)
    }.frame(maxWidth: .infinity)
  }

  private func stampsCard(_ stamped: [StampCity], palette: HomeChromePalette) -> some View {
    Button { showBooklet = true } label: {
      VStack(alignment: .leading, spacing: 12) {
        HStack {
          Text(copy("cityStamps.title")).font(.custom("Satoshi-Bold", size: 20, relativeTo: .title3))
          Spacer()
          Image(systemName: "book.pages").foregroundStyle(palette.primaryText)
        }
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 96), spacing: 8)], spacing: 12) {
          ForEach(Array(stamped.enumerated()), id: \.element.id) { index, city in
            CityStampView(city: city, size: 96, tilt: .degrees(Self.tilts[index % Self.tilts.count]), palette: palette)
          }
        }
      }
      .padding(14).frame(maxWidth: .infinity, alignment: .leading)
      .background { ZStack { palette.surface; ContourPaper(seed: 7, palette: palette) } }
      .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
      .overlay { RoundedRectangle(cornerRadius: 20, style: .continuous).strokeBorder(palette.border, lineWidth: 0.5) }
    }
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(copy("cityStamps.title"))
    .accessibilityValue(stamped.map { copy($0.labelKey) }.formatted(.list(type: .and)))
    .accessibilityAddTraits(.isButton)
  }

  private func cityCard(_ section: PassportSection, palette: HomeChromePalette) -> some View {
    VStack(alignment: .leading, spacing: 12) {
      HStack(spacing: 12) {
        if let stamp = section.cityStamp {
          CityStampView(city: stamp, size: 56, tilt: .degrees(-6), palette: palette).accessibilityHidden(true)
        }
        VStack(alignment: .leading, spacing: 2) {
          Text(section.city ?? copy("passport.elsewhere")).font(.custom("Satoshi-Bold", size: 20, relativeTo: .title3))
          if let row = section.completion {
            Text(copy("passport.ringCount", ["visited": String(row.stamped), "total": String(row.total)]))
              .font(.footnote).monospacedDigit().foregroundStyle(palette.muted)
          }
        }
      }
      .accessibilityElement(children: .combine).accessibilityAddTraits(.isHeader)
      LazyVStack(alignment: .leading, spacing: 12) {
        ForEach(section.places) { stamp in
          Button { selected = stamp } label: { stampRow(stamp, palette) }
        }
      }
      let layout = dynamicType.isAccessibilitySize
        ? AnyLayout(VStackLayout(alignment: .leading, spacing: 8)) : AnyLayout(HStackLayout(spacing: 8))
      layout {
        if let city = section.city, let counts = section.completion, counts.stamped < counts.total,
          let link = nextLink(city) {
          NavigationLink(value: link) { pill(copy("passport.nextTitle"), "seal", palette) }
        }
        if let city = section.city, !section.places.isEmpty {
          NavigationLink { PassportCard(section: section) } label: {
            pill(copy("passport.shareCity", ["city": city]), "square.and.arrow.up", palette)
          }
        }
      }
    }
    .paperCard(palette)
  }

  private func nextLink(_ city: String) -> AppLink? {
    var parts = URLComponents()
    parts.path = "/next-to-stamp"
    parts.queryItems = [URLQueryItem(name: "city", value: city)]
    return parts.string.flatMap { AppLink($0) }
  }

  private func pill(_ title: String, _ symbol: String, _ palette: HomeChromePalette) -> some View {
    Label(title, systemImage: symbol)
      .font(.custom("Satoshi-Bold", size: 14, relativeTo: .subheadline)).foregroundStyle(palette.primaryText)
      .padding(.horizontal, 12).padding(.vertical, 8).frame(minHeight: 44)
      .background(palette.background, in: Capsule())
  }

  private func stampRow(_ stamp: PassportStamp, _ palette: HomeChromePalette) -> some View {
    HStack(spacing: 12) {
      AsyncImage(url: stamp.cover.flatMap(URL.init(string:))) { image in
        image.resizable().scaledToFill()
      } placeholder: {
        Image(systemName: "seal").foregroundStyle(palette.muted)
      }.frame(width: 46, height: 46).background(palette.background).clipShape(Circle())
      VStack(alignment: .leading, spacing: 2) {
        Text(stamp.name).font(.custom("Satoshi-Regular", size: 16, relativeTo: .body)).multilineTextAlignment(.leading)
        if let date = stamp.date { Text(date, style: .date).font(.caption).foregroundStyle(palette.muted) }
      }
      Spacer(minLength: 0)
      Image(systemName: "chevron.right").font(.footnote.weight(.semibold)).foregroundStyle(palette.muted)
        .accessibilityHidden(true)
    }
    .contentShape(Rectangle())
  }
}

private extension View {
  func paperCard(_ palette: HomeChromePalette) -> some View {
    padding(14).frame(maxWidth: .infinity, alignment: .leading)
      .background(palette.surface, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
      .overlay { RoundedRectangle(cornerRadius: 16, style: .continuous).strokeBorder(palette.border, lineWidth: 0.5) }
  }
}

private struct PassportCard: View {
  let section: PassportSection
  @Environment(\.copy) private var copy
  @State private var share: UIImage?

  var body: some View {
    ScrollView {
      art.padding()
      if let share {
        let image = Image(uiImage: share)
        ShareLink(item: image, preview: SharePreview(section.city ?? copy("passport.title"), image: image)) {
          Label(copy("passport.shareCity", ["city": section.city ?? ""]), systemImage: "square.and.arrow.up")
        }.buttonStyle(.borderedProminent)
      }
    }
    .task(id: section.places.map { "\($0.id):\($0.name):\($0.visitedAt):\($0.source ?? "")" }) {
      let renderer = ImageRenderer(content: art.frame(width: 350).environment(\.copy, copy))
      renderer.scale = 3
      share = renderer.uiImage
    }
  }

  private var art: some View {
    VStack(alignment: .leading, spacing: 18) {
      Text(copy("passport.cardKicker")).font(.caption.weight(.bold)).textCase(.uppercase)
      Text(section.city ?? copy("passport.elsewhere")).font(.largeTitle.bold())
      if let month = section.month {
        Text(month.formatted(.dateTime.month(.wide).year())).font(.subheadline)
      }
      Divider()
      ForEach(Array(section.cardPlaces.enumerated()), id: \.element.id) { index, place in
        HStack(alignment: .firstTextBaseline) {
          Text(String(index + 1)).font(.caption.monospacedDigit())
          Text(place.name).font(.title3)
        }
      }
      if section.places.count > section.cardPlaces.count {
        Text("+\(section.places.count - section.cardPlaces.count)").font(.subheadline)
      }
      Divider()
      Text(copy(section.sourceLabel)).font(.subheadline)
      Text(copy("passport.cardWent")).font(.headline)
    }.frame(maxWidth: .infinity, alignment: .leading).padding(24)
      .foregroundStyle(.black).background(Color(red: 1, green: 0.95, blue: 0.82), in: RoundedRectangle(cornerRadius: 18))
  }
}
