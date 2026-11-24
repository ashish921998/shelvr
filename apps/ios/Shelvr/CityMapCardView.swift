import ShelvrKit
import SwiftUI

struct CityMapCardView: View {
  let city: String
  @Environment(Backend.self) private var backend
  @Environment(\.copy) private var copy

  var body: some View {
    SocialQuery(query: "items:listCityItems", arguments: ["city": city], type: [LibrarySave].self) { saves in
      SocialQuery(query: "placeVisits:listVisits", type: [MapVisit].self) { visits in
        let pins = CityPlace.pins(in: saves)
        let went = CityPlace.visited(visits, among: pins)
        ScrollView {
          let art = card(pins, went)
          art
          if !pins.isEmpty {
            CityMapExport(art: art, name: city, pins: pins, went: went)
          }
        }
      }
    }.navigationTitle(copy("cityCard.share"))
  }

  private func card(_ pins: [CityPlace], _ went: Set<CityPlace>) -> some View {
    VStack(alignment: .leading, spacing: 16) {
      Text(copy("cityCard.title", ["city": city])).font(.largeTitle.bold())
      Text(copy("passport.ringCount", ["visited": String(went.count), "total": String(pins.count)]))
      ProgressView(value: Double(went.count), total: Double(max(1, pins.count))).tint(.orange)
      Canvas { context, size in
        let points = CityPlace.cardPoints(pins, visited: went, width: size.width, height: size.height)
        for point in points.reversed() {
          let dot = CGRect(x: point.x - 7, y: point.y - 7, width: 14, height: 14)
          let mark = Path(ellipseIn: dot)
          context.fill(mark, with: .color(went.contains(point.pin) ? .orange : .white))
          context.stroke(mark, with: .color(.black), lineWidth: 1.5)
        }
      }
      .background(Color.black.opacity(0.06), in: RoundedRectangle(cornerRadius: 12))
      .accessibilityLabel(copy("cityCard.mapLabel", ["city": city]))
      HStack {
        Label(copy("cityCard.legendSaved"), systemImage: "circle")
        Label(copy("cityCard.legendVisited"), systemImage: "circle.fill")
      }.font(.caption)
      Text(copy("cityCard.footer")).font(.headline)
    }
    .padding(24).frame(width: 320, height: 320 * 16 / 9)
    .foregroundStyle(.black).background(Color(red: 1, green: 0.95, blue: 0.82), in: RoundedRectangle(cornerRadius: 18))
    .padding(.vertical)
  }
}

private struct CityMapExport<Art: View>: View {
  let art: Art
  let name: String
  let pins: [CityPlace]
  let went: Set<CityPlace>
  @Environment(\.copy) private var copy
  @State private var image: UIImage?

  var body: some View {
    Group {
      if let image {
        let bitmap = Image(uiImage: image)
        ShareLink(item: bitmap, preview: SharePreview(name, image: bitmap)) {
          Label(copy("common.share"), systemImage: "square.and.arrow.up")
        }.buttonStyle(.borderedProminent)
      } else { ProgressView() }
    }.task(id: Key(pins: pins, went: went)) {
      let renderer = ImageRenderer(content: art)
      renderer.scale = 3
      image = renderer.uiImage
    }
  }

  private struct Key: Equatable { let pins: [CityPlace]; let went: Set<CityPlace> }
}
