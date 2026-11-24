import ShelvrKit
import SwiftUI

struct LibraryCityPhoto: View {
  let city: LibraryCity
  @State private var failures = Set<URL>()

  private var candidates: [URL] {
    let resource = "library-city-" + LibraryCity.coverName(city.city)
    let curated = Bundle.main.url(forResource: resource, withExtension: "jpg")
      ?? Bundle.main.url(forResource: resource, withExtension: "jpg", subdirectory: "CityPictures")
    return city.coverCandidates(curated: curated)
  }

  var body: some View {
    if let source = candidates.first(where: { !failures.contains($0) }) {
      if source.isFileURL, let image = UIImage(contentsOfFile: source.path) {
        Image(uiImage: image).resizable().scaledToFill()
      } else {
        AsyncImage(url: source) { phase in
          switch phase {
          case let .success(image): image.resizable().scaledToFill()
          case .failure: Color.clear.task { failures.insert(source) }
          default: Color.clear
          }
        }
      }
    }
  }
}
