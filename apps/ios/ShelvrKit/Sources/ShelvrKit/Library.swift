import Combine
import ConvexMobile
import Foundation

public struct LibrarySave: Decodable, Identifiable, Sendable {
  public let _id: String
  public let _creationTime: Double
  public let title: String?
  public let siteName: String?
  public let url: String?
  public let cities: [String]?
  public let status: String
  public let imageUrl: String?
  public let heroImageUrl: String?
  public let failureReason: String?
  public let enrichment: String?
  public let description: String?
  public let content: String?
  public let note: String?

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

extension Backend {
  public func libraryPage(after cursor: String?) -> some AsyncSequence<LibraryPage, any Error> {
    let options: [String: ConvexEncodable?] = ["numItems": 40.0, "cursor": cursor]
    return client.subscribe(to: "items:listItemsPage", with: ["paginationOpts": options], yielding: LibraryPage.self).values
  }

  public func librarySave(id: String) -> some AsyncSequence<LibrarySave?, any Error> {
    client.subscribe(to: "items:getItem", with: ["id": id], yielding: LibrarySave?.self).values
  }
}
