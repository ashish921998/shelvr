import Foundation

public struct SpotlightThumbnail: Hashable, Sendable {
  public let id: String
  public let url: URL

  public init?(_ row: SearchableSave) {
    guard let source = row.imageUrl ?? row.heroImageUrl, let url = URL(string: source),
      url.scheme?.lowercased() == "https", url.host != nil else { return nil }
    self.id = row._id
    self.url = url
  }

  public static func candidates(in rows: [SearchableSave]) -> [Self] {
    Array(rows.lazy.compactMap(Self.init).prefix(60))
  }
}

public struct SpotlightEntry: Equatable, Sendable {
  public let save: SearchableSave
  public let thumbnail: Data?
}
