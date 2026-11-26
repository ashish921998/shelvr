import ShelvrInbox
import Combine
import ConvexMobile
import Foundation

public struct LibrarySave: Decodable, Identifiable, Sendable {
  public let _id: String
  public let _creationTime: Double
  public let fixtureKey: String?
  public let title: String?
  public let siteName: String?
  public let url: String?
  public let cities: [String]?
  public let places: [String]?
  public let type: String?
  public let status: String
  public let imageUrl: String?
  public let heroImageUrl: String?
  public let failureReason: String?
  public let enrichment: String?
  public let description: String?
  public let content: String?
  public let note: String?
  public let processingStartedAt: Double?
  public let recipe: LibraryRecipe?
  public let products: [LibraryProduct]?
  public let media: [LibraryMedia]?
  public let articleMedia: [LibraryMedia]?
  public let placePins: [EditablePlace]?

  public var id: String { _id }
  public var created: Date { Date(timeIntervalSince1970: _creationTime / 1000) }
  public var needsReview: Bool {
    status == "failed" || (status == "ready" && (cities ?? []).isEmpty)
  }

  public func name(copy: Copy) -> String {
    [title, siteName, url.flatMap { URL(string: $0)?.host }].compactMap { $0?.trimmingCharacters(in: .whitespacesAndNewlines) }
      .first { !$0.isEmpty } ?? copy("homePlaces.untitled")
  }

  public static func days(_ saves: [Self], calendar: Calendar = .current) -> [(Date, [Self])] {
    let groups = Dictionary(grouping: saves) { calendar.startOfDay(for: $0.created) }
    return groups.keys.sorted(by: >).map { day in
      let rows = groups[day] ?? []
      return (day, rows.filter { $0.status == "processing" } + rows.filter { $0.status != "processing" })
    }
  }
}

public struct LibraryPage: Decodable, Sendable {
  public let page: [LibrarySave]
  public let continueCursor: String
  public let isDone: Bool
}

public struct LibraryCity: Decodable, Identifiable, Sendable {
  public let city: String
  public let count: Int
  public let placeCount: Int?
  public let visitedCount: Int?
  public let cover: String?
  public let photo: String?

  public var id: String { city }
}

public enum LibrarySearchState: Sendable {
  case loading, items(String, [LibrarySave]), failure(String)

  public enum Display: Sendable {
    case loading, items([LibrarySave]), failure
  }

  public func display(for query: String) -> Display {
    switch self {
    case let .items(term, rows) where term == query: .items(rows)
    case let .failure(term) where term == query: .failure
    default: .loading
    }
  }
}

extension LibraryCity {
  public static func coverName(_ city: String) -> String {
    let name = city.folding(options: [.diacriticInsensitive, .caseInsensitive], locale: Locale(identifier: "en_US_POSIX"))
      .lowercased().replacingOccurrences(of: "ø", with: "o").split { !$0.isLetter && !$0.isNumber }.joined(separator: "-")
    let aliases = ["nyc": "new-york", "new-york-city": "new-york", "la": "los-angeles", "sf": "san-francisco",
      "lisboa": "lisbon", "praha": "prague", "roma": "rome", "milano": "milan", "firenze": "florence",
      "kobenhavn": "copenhagen", "vegas": "las-vegas"]
    return aliases[name] ?? name
  }

  public func coverCandidates(curated: URL?) -> [URL] {
    let cover = self.cover.flatMap(URL.init(string:))
    let photo = self.photo.flatMap(URL.init(string:))
    var seen = Set<URL>()
    return [cover != photo ? cover : nil, curated, photo ?? cover].compactMap { $0 }.filter { seen.insert($0).inserted }
  }
}

extension Backend {
  public func searchLibrary(_ query: String) -> some AsyncSequence<[LibrarySave], any Error> {
    client.subscribe(to: "items:searchItems", with: ["query": query], yielding: [LibrarySave].self).values
  }

  public func libraryPage(after cursor: String?) -> some AsyncSequence<LibraryPage, any Error> {
    let options: [String: ConvexEncodable?] = ["numItems": 40.0, "cursor": cursor]
    return client.subscribe(to: "items:listItemsPage", with: ["paginationOpts": options], yielding: LibraryPage.self).values
  }

  public func librarySave(id: String) -> some AsyncSequence<LibrarySave?, any Error> {
    client.subscribe(to: "items:getItem", with: ["id": id], yielding: LibrarySave?.self).values
  }
}

public struct LibraryRecipe: Decodable, Sendable {
  public let name: String?
  public let ingredients: [String]
  public let steps: [String]
}

public struct LibraryProduct: Decodable, Sendable {
  public let title: String
  public let url: String
  public let price: String?
}

public struct LibraryMedia: Decodable, Sendable {
  public let imageUrl: String
}
