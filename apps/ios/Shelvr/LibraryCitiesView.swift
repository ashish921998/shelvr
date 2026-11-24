import ShelvrKit
import SwiftUI

struct LibraryCitiesView: View {
  @Environment(Backend.self) private var backend
  @Environment(\.copy) private var copy
  @State private var cities: [LibraryCity]?
  @State private var failed = false
  @State private var attempt = 0

  var body: some View {
    Group {
      if failed { Button(copy("common.retry")) { attempt += 1 } }
      else if let cities {
        if cities.isEmpty {
          ContentUnavailableView(copy("homePlaces.emptyTitle"), systemImage: "building.2",
            description: Text(copy("homePlaces.emptyBody")))
        } else {
          ScrollView {
            LazyVGrid(columns: [.init(.adaptive(minimum: 145))], spacing: 16) {
              ForEach(cities) { city in
                VStack(alignment: .leading) {
                  AsyncImage(url: (city.cover ?? city.photo).flatMap(URL.init(string:))) { image in
                    image.resizable().scaledToFill()
                  } placeholder: { Color.secondary.opacity(0.12) }
                  .frame(maxWidth: .infinity).frame(height: 140).clipped().clipShape(.rect(cornerRadius: 10))
                  Text(city.city).font(.headline)
                  if let count = city.placeCount {
                    Label(count.formatted(), systemImage: "mappin").font(.caption)
                  }
                }
              }
            }.padding()
          }
        }
      } else { ProgressView() }
    }
    .navigationTitle(copy("homePlaces.cities"))
    .task(id: attempt) {
      failed = false
      do {
        for try await cities in backend.query("items:listCities", as: [LibraryCity].self) { self.cities = cities }
      } catch { if !Task.isCancelled { failed = true } }
    }
  }
}
