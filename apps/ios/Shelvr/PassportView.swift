import ShelvrKit
import SwiftUI

struct PassportView: View {
  var cardCity: String?
  @Environment(Backend.self) private var backend
  @Environment(\.copy) private var copy
  @State private var stamps: [PassportStamp]?
  @State private var cities: [PassportCityStamp] = []
  @State private var completion: [PassportCompletion] = []
  @State private var errors = Set<String>()
  @State private var retry = 0

  var body: some View {
    let pages = PassportPages(stamps: stamps ?? [], completion: completion, cities: cities)
    let sections = pages.sections
    Group {
      if let stamps {
        if let cardCity {
          if let section = sections.first(where: { $0.id == PassportSection.cityKey(cardCity) }), !section.places.isEmpty {
            PassportCard(section: section)
          } else { Text(copy("passport.nextEmpty", ["city": cardCity])) }
        } else {
          List {
            let counts = StampCity.counts(places: stamps, stamps: cities)
            HStack {
              count(stamps.count, "passport.places")
              count(counts.cities, "passport.cities")
              if counts.countries > 0 { count(counts.countries, "passport.countries") }
            }
            if !pages.standalone.isEmpty {
              Section(copy("cityStamps.title")) {
                ForEach(pages.standalone) { city in
                  Label(copy(city.labelKey), systemImage: "seal")
                }
              }
            }
            ForEach(sections) { section in
              Section {
                ForEach(section.places) { stamp in
                  if let item = stamp.itemId, let link = AppLink("/item/" + item) {
                    NavigationLink(value: link) { stampRow(stamp) }
                  } else { stampRow(stamp) }
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
            if sections.isEmpty, cities.isEmpty {
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
    .navigationTitle(cardCity ?? copy("passport.title"))
    .task(id: retry) {
      await watch("placeVisits:listPassportStamps", [PassportStamp].self) { stamps = $0 }
    }
    .task(id: retry) {
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
