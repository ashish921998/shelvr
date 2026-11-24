import ShelvrKit
import SwiftUI

struct LibraryCityPhoto: View {
  let city: LibraryCity
  @State private var failures = Set<URL>()

  private var candidates: [URL] {
    let cover = city.cover.flatMap(URL.init(string:))
    let photo = city.photo.flatMap(URL.init(string:))
    let name = city.city.folding(options: [.diacriticInsensitive, .caseInsensitive], locale: Locale(identifier: "en_US_POSIX"))
      .lowercased().replacingOccurrences(of: "ø", with: "o").split { !$0.isLetter && !$0.isNumber }.joined(separator: "-")
    let aliases = ["nyc": "new-york", "new-york-city": "new-york", "la": "los-angeles", "sf": "san-francisco",
      "lisboa": "lisbon", "praha": "prague", "roma": "rome", "milano": "milan", "firenze": "florence",
      "kobenhavn": "copenhagen", "vegas": "las-vegas"]
    let resource = "library-city-" + (aliases[name] ?? name)
    let curated = Bundle.main.url(forResource: resource, withExtension: "jpg")
      ?? Bundle.main.url(forResource: resource, withExtension: "jpg", subdirectory: "CityPictures")
    return [cover != photo ? cover : nil, curated, photo ?? cover].compactMap { $0 }
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
