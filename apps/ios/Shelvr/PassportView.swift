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
          List {
            let counts = StampCity.counts(places: stamps, stamps: cities ?? [])
            HStack {
              count(stamps.count, "passport.places")
              count(counts.cities, "passport.cities")
              if counts.countries > 0 { count(counts.countries, "passport.countries") }
            }
            if let cities, !errors.contains("placeVisits:cityCompletion") {
              PassportBadgeView(cities: cities, completion: completion)
            }
            if !pages.standalone.isEmpty {
              let palette = HomeChromePalette(scheme, appearance: appearance)
              Section(copy("cityStamps.title")) {
                Button { showBooklet = true } label: {
                  LazyVGrid(columns: [GridItem(.adaptive(minimum: 112), spacing: 8)], spacing: 8) {
                    ForEach(Array(pages.standalone.enumerated()), id: \.element.id) { index, city in
                      CityStampView(city: city, tilt: .degrees(Self.tilts[index % Self.tilts.count]), palette: palette)
                    }
                  }
                  .frame(maxWidth: .infinity)
                  .padding(.vertical, 8)
                  .background { ContourPaper(seed: 7, palette: palette) }
                }
                .buttonStyle(.plain)
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(copy("cityStamps.title"))
              }
            }
            if let already = AppLink("/already-been") {
              NavigationLink(value: already) { Label(copy("passport.beenSomewhere"), systemImage: "checkmark.seal") }
            }
            ForEach(sections) { section in
              Section {
                ForEach(section.places) { stamp in
                  Button { selected = stamp } label: { stampRow(stamp) }.buttonStyle(.plain)
                }
                if let city = section.city, let counts = section.completion, counts.stamped < counts.total {
                  var url: URLComponents {
                    var parts = URLComponents()
                    parts.path = "/next-to-stamp"
                    parts.queryItems = [URLQueryItem(name: "city", value: city)]
                    return parts
                  }
                  if let link = url.string.flatMap({ AppLink($0) }) {
                    NavigationLink(copy("passport.nextTitle"), value: link)
                  }
                }
                if let city = section.city, !section.places.isEmpty {
                  NavigationLink {
                    PassportCard(section: section)
                  } label: {
                    Label(copy("passport.shareCity", ["city": city]), systemImage: "square.and.arrow.up")
                  }
                }
              } header: {
                HStack {
                  if section.cityStamp != nil { Image(systemName: "seal.fill") }
                  Text(section.city ?? copy("passport.elsewhere"))
                  Spacer()
                  if let row = section.completion {
                    Text(copy("passport.ringCount", ["visited": String(row.stamped), "total": String(row.total)]))
                  }
                }
              }
            }
            if sections.isEmpty, cities?.isEmpty == true {
              ContentUnavailableView(copy("passport.beenSomewhere"), systemImage: "book.closed",
                description: Text(copy("passport.beenBody")))
            }
          }
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

  private func count(_ number: Int, _ key: String) -> some View {
    VStack {
      Text(number, format: .number).font(.title.bold())
      Text(copy(key)).font(.caption)
    }.frame(maxWidth: .infinity)
  }

  private func stampRow(_ stamp: PassportStamp) -> some View {
    HStack {
      AsyncImage(url: stamp.cover.flatMap(URL.init(string:))) { image in
        image.resizable().scaledToFill()
      } placeholder: {
        Image(systemName: "seal").foregroundStyle(.secondary)
      }.frame(width: 46, height: 46).clipShape(Circle())
      VStack(alignment: .leading) {
        Text(stamp.name)
        if let date = stamp.date { Text(date, style: .date).font(.caption).foregroundStyle(.secondary) }
      }
    }
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
